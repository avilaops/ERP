//! Work Stealing Scheduler
//!
//! This module implements a work-stealing scheduler for better load balancing
//! across threads. Each thread has its own deque and can steal work from others.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::thread;

/// A work-stealing deque for task distribution
pub struct WorkStealingDeque<T> {
    tasks: Arc<Mutex<VecDeque<T>>>,
}

impl<T> WorkStealingDeque<T> {
    /// Create a new work-stealing deque
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(VecDeque::new())),
        }
    }

    /// Push a task to the front (local end)
    pub fn push(&self, task: T) {
        self.tasks.lock().unwrap().push_front(task);
    }

    /// Pop a task from the front (local end)
    pub fn pop(&self) -> Option<T> {
        self.tasks.lock().unwrap().pop_front()
    }

    /// Steal a task from the back (remote end)
    pub fn steal(&self) -> Option<T> {
        self.tasks.lock().unwrap().pop_back()
    }

    /// Get the number of tasks
    pub fn len(&self) -> usize {
        self.tasks.lock().unwrap().len()
    }

    /// Check if the deque is empty
    pub fn is_empty(&self) -> bool {
        self.tasks.lock().unwrap().is_empty()
    }
}

impl<T> Clone for WorkStealingDeque<T> {
    fn clone(&self) -> Self {
        Self {
            tasks: Arc::clone(&self.tasks),
        }
    }
}

/// Work-stealing thread pool
pub struct WorkStealingPool {
    workers: Vec<WorkStealingDeque<Box<dyn FnOnce() + Send + 'static>>>,
    num_workers: usize,
}

impl WorkStealingPool {
    /// Create a new work-stealing pool
    pub fn new(num_threads: usize) -> Self {
        let num_threads = if num_threads == 0 {
            thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(1)
        } else {
            num_threads
        };

        let workers: Vec<_> = (0..num_threads)
            .map(|_| WorkStealingDeque::new())
            .collect();

        Self {
            workers,
            num_workers: num_threads,
        }
    }

    /// Execute a task using work stealing
    pub fn execute<F>(&self, tasks: Vec<F>)
    where
        F: FnOnce() + Send + 'static,
    {
        // Distribute tasks to workers
        for (idx, task) in tasks.into_iter().enumerate() {
            let worker_idx = idx % self.num_workers;
            self.workers[worker_idx].push(Box::new(task));
        }

        // Spawn threads
        thread::scope(|s| {
            for (thread_id, worker) in self.workers.iter().enumerate() {
                let worker = worker.clone();
                let all_workers = self.workers.clone();

                s.spawn(move || {
                    loop {
                        // Try to get local work
                        if let Some(task) = worker.pop() {
                            task();
                            continue;
                        }

                        // Try to steal from others
                        let mut found_work = false;
                        for (other_id, other_worker) in all_workers.iter().enumerate() {
                            if other_id != thread_id {
                                if let Some(task) = other_worker.steal() {
                                    task();
                                    found_work = true;
                                    break;
                                }
                            }
                        }

                        if !found_work {
                            // No work available, exit
                            break;
                        }
                    }
                });
            }
        });
    }

    /// Get the number of workers
    pub fn num_workers(&self) -> usize {
        self.num_workers
    }
}

/// Parallel map with work stealing
///
/// Note: This is a simplified implementation for demonstration.
/// For production use, consider using a dedicated work-stealing library.
pub fn work_stealing_map<T, R, F>(items: &[T], f: F) -> Vec<R>
where
    T: Sync,
    R: Send + 'static,
    F: Fn(&T) -> R + Send + Sync,
{
    use crate::executor::parallel_map;
    parallel_map(items, f)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_work_stealing_deque() {
        let deque = WorkStealingDeque::new();
        deque.push(1);
        deque.push(2);
        deque.push(3);

        assert_eq!(deque.pop(), Some(3));
        assert_eq!(deque.steal(), Some(1));
        assert_eq!(deque.pop(), Some(2));
        assert!(deque.is_empty());
    }

    #[test]
    fn test_work_stealing_pool() {
        let pool = WorkStealingPool::new(2);
        let counter = Arc::new(Mutex::new(0));

        let tasks: Vec<_> = (0..10)
            .map(|_| {
                let counter = Arc::clone(&counter);
                move || {
                    *counter.lock().unwrap() += 1;
                }
            })
            .collect();

        pool.execute(tasks);
        assert_eq!(*counter.lock().unwrap(), 10);
    }

    #[test]
    fn test_work_stealing_map() {
        let data = vec![1, 2, 3, 4, 5];
        let results = work_stealing_map(&data, |x| x * 2);
        assert_eq!(results, vec![2, 4, 6, 8, 10]);
    }
}
