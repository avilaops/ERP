use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

use anyhow::{anyhow, Context, Result};
use camino::{Utf8Path, Utf8PathBuf};
use cargo_metadata::{Metadata, MetadataCommand};
use clap::{Parser, Subcommand};
use serde::Deserialize;

#[derive(Parser, Debug)]
#[command(author, version, about = "Workspace utility tasks for the Avila platform.", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Validate one or more crates against the completion checklist
    CheckCrate {
        /// Package name to validate (defaults to current directory crate when --manifest is omitted)
        #[arg(long, short = 'p')]
        package: Option<String>,
        /// Path to a crate manifest (Cargo.toml)
        #[arg(long)]
        manifest: Option<Utf8PathBuf>,
        /// Skip running `cargo check`
        #[arg(long)]
        no_cargo_check: bool,
    },
    /// Validate every crate that belongs to the root workspace
    CheckWorkspace {
        /// Skip running `cargo check`
        #[arg(long)]
        no_cargo_check: bool,
    },
}

#[derive(Debug, Default)]
struct ChecklistOptions {
    run_cargo_check: bool,
}

#[derive(Debug, Default)]
struct ChecklistReport {
    package: String,
    warnings: Vec<String>,
    failures: Vec<String>,
}

impl ChecklistReport {
    fn is_success(&self) -> bool {
        self.failures.is_empty()
    }
}

#[derive(Debug, Deserialize)]
struct PackageSection {
    name: String,
    version: String,
    description: Option<String>,
    license: Option<String>,
    #[serde(rename = "license-file")]
    license_file: Option<String>,
    edition: Option<String>,
    repository: Option<String>,
    readme: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct LibSection {
    path: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct BinSection {
    name: Option<String>,
    path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Manifest {
    package: Option<PackageSection>,
    lib: Option<LibSection>,
    bin: Option<Vec<BinSection>>,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let workspace_root = locate_workspace_root()?;

    match cli.command {
        Commands::CheckCrate {
            package,
            manifest,
            no_cargo_check,
        } => {
            let options = ChecklistOptions {
                run_cargo_check: !no_cargo_check,
            };
            let targets = resolve_targets(&workspace_root, package.as_deref(), manifest.as_deref())?;
            run_checks(targets, &options)
        }
        Commands::CheckWorkspace { no_cargo_check } => {
            let options = ChecklistOptions {
                run_cargo_check: !no_cargo_check,
            };
            let metadata = load_metadata(&workspace_root)?;
            let mut targets = Vec::new();
            for member in &metadata.workspace_members {
                let package = &metadata[member];
                targets.push((package.name.clone(), package.manifest_path.clone()));
            }
            run_checks(targets, &options)
        }
    }
}

fn run_checks(targets: Vec<(String, Utf8PathBuf)>, options: &ChecklistOptions) -> Result<()> {
    if targets.is_empty() {
        return Err(anyhow!("No crates matched the provided filters"));
    }

    let mut overall_success = true;
    for (idx, (name, manifest_path)) in targets.iter().enumerate() {
        if idx > 0 {
            println!("\n---\n");
        }
        println!("Checking crate `{}`...", name);
        let report = evaluate_crate(manifest_path, options)?;
        if report.is_success() {
            println!("  ✓ Metadata looks good");
        } else {
            overall_success = false;
            for failure in &report.failures {
                println!("  ✗ {}", failure);
            }
        }
        for warning in &report.warnings {
            println!("  ⚠ {}", warning);
        }
    }

    if overall_success {
        println!("\nAll checks passed.");
        Ok(())
    } else {
        Err(anyhow!("One or more crates failed the checklist"))
    }
}

fn evaluate_crate(manifest_path: &Utf8Path, options: &ChecklistOptions) -> Result<ChecklistReport> {
    let manifest_str = fs::read_to_string(manifest_path.as_std_path())
        .with_context(|| format!("Failed to read manifest at {}", manifest_path))?;
    let manifest: Manifest = toml::from_str(&manifest_str)
        .with_context(|| format!("Failed to parse manifest at {}", manifest_path))?;

    let mut report = ChecklistReport {
        package: manifest
            .package
            .as_ref()
            .map(|pkg| pkg.name.clone())
            .unwrap_or_else(|| manifest_path.parent().map(|p| p.file_name().unwrap_or("<unknown>")).unwrap_or("<unknown>").to_string()),
        warnings: Vec::new(),
        failures: Vec::new(),
    };

    let Some(package) = manifest.package.as_ref() else {
        report.failures.push("Missing [package] section".to_string());
        return Ok(report);
    };

    if package.name.trim().is_empty() {
        report
            .failures
            .push("Package name is empty".to_string());
    }
    if package.version.trim().is_empty() {
        report
            .failures
            .push("Package version is empty".to_string());
    }
    if package.edition.as_deref().unwrap_or("").is_empty() {
        report
            .failures
            .push("Package edition is missing".to_string());
    }
    if package.license.as_deref().unwrap_or("").is_empty()
        && package.license_file.as_deref().unwrap_or("").is_empty()
    {
        report
            .failures
            .push("Package license (or license-file) is missing".to_string());
    }
    if package.description.as_deref().unwrap_or("").is_empty() {
        report
            .warnings
            .push("Package description is missing".to_string());
    }
    if package.repository.as_deref().unwrap_or("").is_empty() {
        report
            .warnings
            .push("Package repository URL is missing".to_string());
    }
    if let Some(readme) = package.readme.as_ref() {
        let readme_path = manifest_path.parent().unwrap().join(readme);
        if !readme_path.exists() {
            report
                .warnings
                .push(format!("Declared readme file '{}' not found", readme));
        }
    }

    let crate_dir = manifest_path
        .parent()
        .ok_or_else(|| anyhow!("Manifest has no parent directory"))?;

    let has_library = check_library(&manifest, crate_dir, &mut report);
    let has_binary = check_binaries(&manifest, crate_dir, &mut report);

    if !has_library && !has_binary {
        report
            .failures
            .push("No library or binary target was found".to_string());
    }

    if options.run_cargo_check {
        if let Err(err) = run_cargo_check(&report.package, manifest_path) {
            report.failures.push(format!("cargo check failed: {}", err));
        }
    }

    Ok(report)
}

fn check_library(manifest: &Manifest, crate_dir: &Utf8Path, report: &mut ChecklistReport) -> bool {
    if let Some(lib) = manifest.lib.as_ref() {
        if let Some(path) = lib.path.as_ref() {
            let target_path = crate_dir.join(path);
            if target_path.exists() {
                return true;
            }
            report
                .warnings
                .push(format!("Declared library target missing at {}", target_path));
        }
    }

    if crate_dir.join("src/lib.rs").exists() {
        return true;
    }

    false
}

fn check_binaries(manifest: &Manifest, crate_dir: &Utf8Path, report: &mut ChecklistReport) -> bool {
    let mut found = false;

    if let Some(bins) = manifest.bin.as_ref() {
        for bin in bins {
            let path = match (&bin.path, &bin.name) {
                (Some(path), _) => crate_dir.join(path),
                (None, Some(name)) => crate_dir.join("src").join("bin").join(format!("{}.rs", name)),
                (None, None) => crate_dir.join("src/main.rs"),
            };
            if path.exists() {
                found = true;
            } else {
                report
                    .warnings
                    .push(format!("Declared binary target missing at {}", path));
            }
        }
    }

    if crate_dir.join("src/main.rs").exists() {
        found = true;
    }
    if let Ok(mut entries) = fs::read_dir(crate_dir.join("src/bin").as_std_path()) {
        if entries.next().is_some() {
            found = true;
        }
    }

    found
}

fn run_cargo_check(package: &str, manifest_path: &Utf8Path) -> Result<()> {
    let status = Command::new("cargo")
        .arg("check")
        .arg("--manifest-path")
        .arg(manifest_path.as_str())
        .arg("--package")
        .arg(package)
        .status()
        .with_context(|| format!("Failed to spawn cargo check for {}", package))?;

    if status.success() {
        Ok(())
    } else {
        Err(anyhow!("cargo check exited with status {}", status))
    }
}

fn locate_workspace_root() -> Result<Utf8PathBuf> {
    let mut current = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    while current.pop() {
        let candidate = current.join("Cargo.toml");
        if candidate.exists() {
            let content = fs::read_to_string(&candidate)
                .with_context(|| format!("Failed to read {}", candidate.display()))?;
            if content.contains("[workspace]") {
                return Utf8PathBuf::from_path_buf(current.clone())
                    .map_err(|_| anyhow!("Workspace path is not valid UTF-8"));
            }
        }
    }
    Err(anyhow!("Unable to locate workspace root"))
}

fn resolve_targets(
    workspace_root: &Utf8Path,
    package: Option<&str>,
    manifest: Option<&Utf8Path>,
) -> Result<Vec<(String, Utf8PathBuf)>> {
    match (package, manifest) {
        (Some(_), Some(_)) => Err(anyhow!("Use either --package or --manifest, not both")),
        (None, None) => {
            let metadata = load_metadata(workspace_root)?;
            let current_manifest = find_manifest_for_current_dir(&metadata)?;
            Ok(vec![current_manifest])
        }
        (Some(name), None) => {
            let metadata = load_metadata(workspace_root)?;
            let manifest = find_manifest_by_package(&metadata, name)?;
            Ok(vec![manifest])
        }
        (None, Some(manifest_path)) => {
            if !manifest_path.ends_with("Cargo.toml") {
                return Err(anyhow!("Manifest path must point to a Cargo.toml file"));
            }
            Ok(vec![(guess_package_name(manifest_path)?, manifest_path.to_owned())])
        }
    }
}

fn load_metadata(workspace_root: &Utf8Path) -> Result<Metadata> {
    MetadataCommand::new()
        .manifest_path(workspace_root.join("Cargo.toml"))
        .exec()
        .context("Failed to load cargo metadata")
}

fn find_manifest_for_current_dir(metadata: &Metadata) -> Result<(String, Utf8PathBuf)> {
    let current_dir = std::env::current_dir().context("Failed to obtain current directory")?;
    let current_dir = Utf8PathBuf::from_path_buf(current_dir)
        .map_err(|_| anyhow!("Current directory path is not valid UTF-8"))?;

    let mut candidates: BTreeMap<usize, (String, Utf8PathBuf)> = BTreeMap::new();
    for member in &metadata.workspace_members {
        let package = &metadata[member];
        let manifest_dir = package
            .manifest_path
            .parent()
            .ok_or_else(|| anyhow!("Manifest has no parent directory"))?;
        if current_dir.starts_with(manifest_dir) {
            candidates.insert(
                manifest_dir.components().count(),
                (package.name.clone(), package.manifest_path.clone()),
            );
        }
    }

    candidates
        .into_iter()
        .rev()
        .next()
        .map(|(_, entry)| entry)
        .ok_or_else(|| anyhow!("Current directory is not part of the workspace"))
}

fn find_manifest_by_package(metadata: &Metadata, name: &str) -> Result<(String, Utf8PathBuf)> {
    for package in &metadata.packages {
        if package.name == name {
            if metadata.workspace_members.contains(&package.id) {
                return Ok((package.name.clone(), package.manifest_path.clone()));
            }
        }
    }
    Err(anyhow!("Package '{}' not found in workspace", name))
}

fn guess_package_name(manifest_path: &Utf8Path) -> Result<String> {
    let manifest_str = fs::read_to_string(manifest_path.as_std_path())?;
    let manifest: Manifest = toml::from_str(&manifest_str)?;
    if let Some(package) = manifest.package {
        Ok(package.name)
    } else {
        manifest_path
            .parent()
            .and_then(|dir| dir.file_name())
            .map(|name| name.to_string())
            .ok_or_else(|| anyhow!("Unable to derive package name"))
    }
}

