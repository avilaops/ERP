//! Thread pool implementation

use std::sync::{Arc, Mutex, Condvar};
use std::sync::mpsc::{channel, Sender, Receiver};
use std::thread;

type Job = Box<dyn FnOnce() + Send + 'static>;

/// A thread pool for executing tasks concurrently
pub struct ThreadPool {
    workers: Vec<Worker>,
    sender: Sender<Message>,
    active: Arc<Mutex<usize>>,
    condvar: Arc<Condvar>,
}

enum Message {
    NewJob(Job),
    Terminate,
}

impl ThreadPool {
    /// Create a new thread pool with the specified number of threads
    pub fn new(size: usize) -> Self {
        assert!(size > 0);

        let (sender, receiver) = channel();
        let receiver = Arc::new(Mutex::new(receiver));
        let active = Arc::new(Mutex::new(0));
        let condvar = Arc::new(Condvar::new());

        let mut workers = Vec::with_capacity(size);

        for id in 0..size {
            workers.push(Worker::new(
                id,
                Arc::clone(&receiver),
                Arc::clone(&active),
                Arc::clone(&condvar),
            ));
        }

        ThreadPool {
            workers,
            sender,
            active,
            condvar,
        }
    }

    /// Execute a job on the thread pool
    pub fn execute<F>(&self, f: F)
    where
        F: FnOnce() + Send + 'static,
    {
        let job = Box::new(f);
        self.sender.send(Message::NewJob(job)).unwrap();
    }

    /// Wait for all jobs to complete
    pub fn wait(&self) {
        let mut active = self.active.lock().unwrap();
        while *active > 0 {
            active = self.condvar.wait(active).unwrap();
        }
    }

    /// Get number of worker threads
    pub fn size(&self) -> usize {
        self.workers.len()
    }
}

impl Drop for ThreadPool {
    fn drop(&mut self) {
        for _ in &self.workers {
            self.sender.send(Message::Terminate).unwrap();
        }

        for worker in &mut self.workers {
            if let Some(thread) = worker.thread.take() {
                thread.join().unwrap();
            }
        }
    }
}

struct Worker {
    #[allow(dead_code)]
    id: usize,
    thread: Option<thread::JoinHandle<()>>,
}

impl Worker {
    fn new(
        id: usize,
        receiver: Arc<Mutex<Receiver<Message>>>,
        active: Arc<Mutex<usize>>,
        condvar: Arc<Condvar>,
    ) -> Worker {
        let thread = thread::spawn(move || loop {
            let message = receiver.lock().unwrap().recv().unwrap();

            match message {
                Message::NewJob(job) => {
                    *active.lock().unwrap() += 1;
                    job();
                    let mut count = active.lock().unwrap();
                    *count -= 1;
                    condvar.notify_all();
                }
                Message::Terminate => {
                    break;
                }
            }
        });

        Worker {
            id,
            thread: Some(thread),
        }
    }
}

/// Get the number of available CPU cores
pub fn num_cpus() -> usize {
    thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
}

/// Global thread pool (lazy static pattern)
static mut GLOBAL_POOL: Option<ThreadPool> = None;
static INIT: std::sync::Once = std::sync::Once::new();

/// Get or initialize the global thread pool
#[allow(static_mut_refs)]
pub fn global_pool() -> &'static ThreadPool {
    unsafe {
        INIT.call_once(|| {
            GLOBAL_POOL = Some(ThreadPool::new(num_cpus()));
        });
        GLOBAL_POOL.as_ref().unwrap()
    }
}
