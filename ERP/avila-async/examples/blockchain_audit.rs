//! Example: Blockchain Audit Trail
//!
//! Demonstrates immutable event logging with blockchain

use avila_async::{Runtime, RuntimeBlockchain, TransactionType, sleep};
use std::time::Duration;

fn main() {
    let rt = Runtime::new();

    rt.spawn(async {
        println!("⛓️  Blockchain Audit Trail");
        println!("==========================\n");

        // Create blockchain with difficulty 2
        let blockchain = RuntimeBlockchain::new(2);
        println!("✅ Initialized blockchain (difficulty: 2)\n");

        // Add runtime events
        println!("📝 Adding runtime events...\n");

        blockchain.add_transaction(
            TransactionType::TaskSpawned,
            "task_id=1001, priority=high".to_string()
        );
        blockchain.add_transaction(
            TransactionType::TaskSpawned,
            "task_id=1002, priority=medium".to_string()
        );
        blockchain.add_transaction(
            TransactionType::ThreadScaled,
            "threads: 4 → 8".to_string()
        );

        // Mine first block
        println!("⛏️  Mining block 1...");
        let block1 = blockchain.mine_block();
        println!("  {}", block1);
        println!("  Nonce: {}", block1.nonce);
        println!("  Transactions: {}\n", block1.transactions.len());

        sleep(Duration::from_millis(100)).await;

        // Add more events
        blockchain.add_transaction(
            TransactionType::TaskCompleted,
            "task_id=1001, duration=50ms".to_string()
        );
        blockchain.add_transaction(
            TransactionType::AnomalyDetected,
            "spike in latency detected".to_string()
        );
        blockchain.add_transaction(
            TransactionType::ConfigChanged,
            "max_threads: 8 → 16".to_string()
        );

        // Mine second block
        println!("⛏️  Mining block 2...");
        let block2 = blockchain.mine_block();
        println!("  {}", block2);
        println!("  Nonce: {}", block2.nonce);
        println!("  Transactions: {}\n", block2.transactions.len());

        sleep(Duration::from_millis(100)).await;

        // Add custom events
        blockchain.add_transaction(
            TransactionType::Custom("Deployment".to_string()),
            "version=0.5.0, region=us-east".to_string()
        );
        blockchain.add_transaction(
            TransactionType::TaskCompleted,
            "task_id=1002, duration=75ms".to_string()
        );

        // Mine third block
        println!("⛏️  Mining block 3...");
        let block3 = blockchain.mine_block();
        println!("  {}", block3);
        println!("  Nonce: {}", block3.nonce);
        println!("  Transactions: {}\n", block3.transactions.len());

        // Verify blockchain integrity
        println!("🔍 Verifying blockchain integrity...");
        let is_valid = blockchain.verify();
        println!("  Status: {}\n", if is_valid { "✅ VALID" } else { "❌ INVALID" });

        // Show statistics
        let stats = blockchain.stats();
        println!("📊 Blockchain Statistics:");
        println!("  {}\n", stats);

        // Search transactions
        println!("🔎 Searching for TaskCompleted events:");
        let completed = blockchain.search_transactions("TaskCompleted");
        for tx in completed {
            println!("  - {}", tx.data);
        }

        // Show recent blocks
        println!("\n📚 Recent Blocks:");
        for block in blockchain.recent_blocks(3) {
            println!("  Block #{}: {} transactions, hash={}",
                block.index,
                block.transactions.len(),
                &block.hash[..16]
            );
        }

        println!("\n✅ Blockchain audit trail demo complete!");
        println!("\n💡 All runtime events are immutably recorded");
    });

    rt.run();
}
