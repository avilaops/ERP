use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::thread;

fn main() {
    let listener = TcpListener::bind("127.0.0.1:8000").unwrap();
    println!("🚀 Servidor rodando em http://localhost:8000");
    println!("📂 Servindo: d:\\arxis\\avila-frontend");
    println!("✨ Ctrl+C para parar\n");

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                thread::spawn(|| handle_client(stream));
            }
            Err(e) => {
                eprintln!("Erro: {}", e);
            }
        }
    }
}

fn handle_client(mut stream: TcpStream) {
    let mut buffer = [0; 1024];
    stream.read(&mut buffer).unwrap();

    let request = String::from_utf8_lossy(&buffer[..]);
    let request_line = request.lines().next().unwrap_or("");

    let path = if let Some(path) = request_line.split_whitespace().nth(1) {
        if path == "/" {
            "/demos.html"
        } else {
            path
        }
    } else {
        "/demos.html"
    };

    let file_path = format!("d:\\arxis\\avila-frontend{}", path);

    if Path::new(&file_path).exists() {
        let contents = fs::read(&file_path).unwrap();
        let content_type = get_content_type(path);

        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\n\r\n",
            content_type,
            contents.len()
        );

        stream.write_all(response.as_bytes()).unwrap();
        stream.write_all(&contents).unwrap();
    } else {
        let response = "HTTP/1.1 404 NOT FOUND\r\n\r\n404 - Arquivo não encontrado";
        stream.write_all(response.as_bytes()).unwrap();
    }

    stream.flush().unwrap();
}

fn get_content_type(path: &str) -> &str {
    if path.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css"
    } else if path.ends_with(".js") {
        "application/javascript"
    } else if path.ends_with(".wasm") {
        "application/wasm"
    } else if path.ends_with(".json") {
        "application/json"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        "image/jpeg"
    } else {
        "text/plain"
    }
}
