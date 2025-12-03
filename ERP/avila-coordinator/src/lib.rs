//! # avila-coordinator - Task Coordination
extern crate alloc;
use alloc::vec::Vec;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TaskState { Pending, Running, Completed, Failed }

pub struct Task {
    pub id: u64,
    pub state: TaskState,
}

pub struct Coordinator {
    pub tasks: Vec<Task>,
}

impl Coordinator {
    pub fn new() -> Self {
        Self { tasks: Vec::new() }
    }
    
    pub fn submit(&mut self, id: u64) {
        self.tasks.push(Task { id, state: TaskState::Pending });
    }
    
    pub fn complete(&mut self, id: u64) {
        if let Some(task) = self.tasks.iter_mut().find(|t| t.id == id) {
            task.state = TaskState::Completed;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_coordinator() {
        let mut coord = Coordinator::new();
        coord.submit(1);
        coord.complete(1);
        assert_eq!(coord.tasks[0].state, TaskState::Completed);
    }
}
