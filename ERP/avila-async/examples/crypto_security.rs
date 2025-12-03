//! Example: Cryptographic Security
//!
//! Demonstrates encryption and secure communication

use avila_async::{Runtime, CryptoService, SecureChannel, sleep};
use std::time::Duration;

fn main() {
    let rt = Runtime::new();

    rt.spawn(async {
        println!("🔐 Cryptographic Security Demo");
        println!("================================\n");

        // Create crypto service
        let crypto = CryptoService::new();
        println!("✅ Initialized cryptographic service\n");

        // Generate encryption keys
        println!("🔑 Generating encryption keys...\n");
        let key1 = crypto.generate_key();
        let key2 = crypto.generate_key();
        let key3 = crypto.generate_key();
        println!("  Key 1: ID = {}", key1);
        println!("  Key 2: ID = {}", key2);
        println!("  Key 3: ID = {}\n", key3);

        sleep(Duration::from_millis(100)).await;

        // Encrypt data
        println!("🔒 Encrypting sensitive data...\n");
        let plaintext = b"Secret runtime configuration: max_threads=16";
        println!("  Plaintext: {}", String::from_utf8_lossy(plaintext));

        let ciphertext = crypto.encrypt(key1, plaintext);
        println!("  Ciphertext: {:?}\n", ciphertext);

        // Decrypt data
        println!("🔓 Decrypting data...\n");
        let decrypted = crypto.decrypt(key1, &ciphertext);
        println!("  Decrypted: {}\n", String::from_utf8_lossy(&decrypted));

        sleep(Duration::from_millis(100)).await;

        // Hash data
        println!("#️⃣  Hashing data for integrity...\n");
        let data = b"Critical runtime metrics: cpu=85%, mem=12GB";
        let hash = crypto.hash(data);
        println!("  Data: {}", String::from_utf8_lossy(data));
        println!("  Hash: {}\n", hash);

        // Verify integrity
        println!("✓ Verifying data integrity...");
        let is_valid = crypto.verify(data, &hash);
        println!("  Status: {}\n", if is_valid { "✅ VALID" } else { "❌ INVALID" });

        // Sign data
        println!("✍️  Signing data...\n");
        let message = b"Approved: scale to 32 threads";
        let signature = crypto.sign(key2, message);
        println!("  Message: {}", String::from_utf8_lossy(message));
        println!("  Signature: {}\n", signature);

        sleep(Duration::from_millis(100)).await;

        // Secure channel demo
        println!("📡 Secure Channel Communication\n");
        let channel = SecureChannel::new(crypto.clone());
        println!("  Channel key ID: {}", channel.key_id());

        let secret_msg = b"Confidential: deployment to production";
        println!("  Sending: {}", String::from_utf8_lossy(secret_msg));

        let encrypted_msg = channel.send(secret_msg);
        println!("  Encrypted: {:?}", encrypted_msg);

        let received_msg = channel.receive(&encrypted_msg);
        println!("  Received: {}\n", String::from_utf8_lossy(&received_msg));

        // Crypto statistics
        let stats = crypto.stats();
        println!("📊 Cryptographic Statistics:");
        println!("  {}", stats);

        println!("\n✅ Cryptographic demo complete!");
        println!("\n💡 All sensitive data is encrypted end-to-end");
    });

    rt.run();
}
