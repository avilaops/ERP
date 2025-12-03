//! Ávila email CLI

use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();

    println!("\nÁvila Mail CLI");
    println!("{}", "=".repeat(50));

    if args.len() < 2 {
        print_help();
        return;
    }

    match args[1].as_str() {
        "send" => println!("Sending email..."),
        "list" => println!("Listing emails..."),
        "read" => println!("Reading email..."),
        "help" | "--help" | "-h" => print_help(),
        _ => {
            println!("Unknown command: {}", args[1]);
            print_help();
        }
    }
}

fn print_help() {
    println!("\nCOMMANDS:");
    println!("  send [to] [subject]    Send email");
    println!("  list                     List emails");
    println!("  read [id]                Read email");
    println!("  help                     Show help");
    println!();
}
