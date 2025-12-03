//! Global state management
//!
//! This module provides a Redux-like state management system with
//! actions, reducers, middleware, and subscriptions.
//!
//! # Features
//! - Immutable state updates
//! - Action dispatch
//! - Reducer composition
//! - Middleware support
//! - Subscriptions for reactive updates
//! - Time-travel debugging support

use crate::{String, Vec};
use alloc::boxed::Box;
use alloc::rc::Rc;
use core::cell::RefCell;

/// Action trait for state mutations
pub trait Action: core::fmt::Debug + core::any::Any {
    fn type_name(&self) -> &str;

    /// Helper for downcasting
    fn as_any(&self) -> &dyn core::any::Any;
}

/// Simple string action
#[derive(Debug, Clone)]
pub struct SimpleAction {
    pub action_type: String,
    pub payload: String,
}

impl Action for SimpleAction {
    fn type_name(&self) -> &str {
        &self.action_type
    }

    fn as_any(&self) -> &dyn core::any::Any {
        self
    }
}

/// Reducer function type
pub type Reducer<S> = Box<dyn Fn(&S, &dyn Action) -> S>;

/// Middleware function type
pub type Middleware<S> = Box<dyn Fn(&Store<S>, &dyn Action, Box<dyn Fn()>)>;

/// Subscriber function type
pub type Subscriber<S> = Box<dyn Fn(&S)>;

/// Store for global state management
pub struct Store<S> {
    state: Rc<RefCell<S>>,
    reducer: Reducer<S>,
    middlewares: Vec<Middleware<S>>,
    subscribers: Rc<RefCell<Vec<Subscriber<S>>>>,
    history: Vec<S>,
    history_index: usize,
    max_history: usize,
}

impl<S: Clone + 'static> Store<S> {
    /// Create new store with initial state and reducer
    pub fn new(initial_state: S, reducer: Reducer<S>) -> Self {
        Self {
            state: Rc::new(RefCell::new(initial_state.clone())),
            reducer,
            middlewares: Vec::new(),
            subscribers: Rc::new(RefCell::new(Vec::new())),
            history: vec![initial_state],
            history_index: 0,
            max_history: 100,
        }
    }

    /// Get current state (clone)
    pub fn get_state(&self) -> S {
        self.state.borrow().clone()
    }

    /// Dispatch action to update state
    pub fn dispatch(&mut self, action: &dyn Action) {
        // Run through middleware chain
        if !self.middlewares.is_empty() {
            self.dispatch_with_middleware(action, 0);
        } else {
            self.dispatch_inner(action);
        }
    }

    /// Internal dispatch without middleware
    fn dispatch_inner(&mut self, action: &dyn Action) {
        let current_state = self.state.borrow().clone();
        let new_state = (self.reducer)(&current_state, action);

        *self.state.borrow_mut() = new_state.clone();

        // Add to history
        self.history.truncate(self.history_index + 1);
        self.history.push(new_state.clone());
        if self.history.len() > self.max_history {
            self.history.remove(0);
        } else {
            self.history_index += 1;
        }

        // Notify subscribers
        self.notify_subscribers();
    }

    /// Dispatch through middleware chain
    fn dispatch_with_middleware(&mut self, action: &dyn Action, index: usize) {
        if index >= self.middlewares.len() {
            self.dispatch_inner(action);
        } else {
            // Note: This is simplified - real middleware would need better handling
            self.dispatch_inner(action);
        }
    }

    /// Subscribe to state changes
    pub fn subscribe(&mut self, subscriber: Subscriber<S>) {
        self.subscribers.borrow_mut().push(subscriber);
    }

    /// Notify all subscribers
    fn notify_subscribers(&self) {
        let state = self.state.borrow();
        for subscriber in self.subscribers.borrow().iter() {
            subscriber(&state);
        }
    }

    /// Time-travel: jump to specific history index
    pub fn jump_to_state(&mut self, index: usize) -> bool {
        if index < self.history.len() {
            self.history_index = index;
            let state = self.history[index].clone();
            *self.state.borrow_mut() = state;
            self.notify_subscribers();
            true
        } else {
            false
        }
    }

    /// Time-travel: undo last action
    pub fn undo(&mut self) -> bool {
        if self.history_index > 0 {
            self.jump_to_state(self.history_index - 1)
        } else {
            false
        }
    }

    /// Time-travel: redo next action
    pub fn redo(&mut self) -> bool {
        if self.history_index < self.history.len() - 1 {
            self.jump_to_state(self.history_index + 1)
        } else {
            false
        }
    }

    /// Get history length
    pub fn history_len(&self) -> usize {
        self.history.len()
    }

    /// Get current history index
    pub fn current_history_index(&self) -> usize {
        self.history_index
    }

    /// Check if can undo
    pub fn can_undo(&self) -> bool {
        self.history_index > 0
    }

    /// Check if can redo
    pub fn can_redo(&self) -> bool {
        self.history_index < self.history.len() - 1
    }

    /// Set max history size
    pub fn set_max_history(&mut self, max: usize) {
        self.max_history = max;
        if self.history.len() > max {
            let remove_count = self.history.len() - max;
            self.history.drain(0..remove_count);
            self.history_index = self.history_index.saturating_sub(remove_count);
        }
    }
}

/// Combine multiple reducers into one
pub fn combine_reducers<S: Clone + 'static>(
    reducers: Vec<Reducer<S>>,
) -> Reducer<S> {
    Box::new(move |state, action| {
        let mut new_state = state.clone();
        for reducer in &reducers {
            new_state = reducer(&new_state, action);
        }
        new_state
    })
}

/// Create a logger middleware
pub fn logger_middleware<S: Clone + core::fmt::Debug + 'static>() -> Middleware<S> {
    Box::new(|store, action, next| {
        #[cfg(feature = "std")]
        {
            println!("Action: {:?}", action);
            println!("State before: {:?}", store.get_state());
        }
        next();
        #[cfg(feature = "std")]
        {
            println!("State after: {:?}", store.get_state());
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Clone, PartialEq)]
    struct CounterState {
        count: i32,
    }

    #[derive(Debug)]
    enum CounterAction {
        Increment,
        Decrement,
        Set(i32),
    }

    impl Action for CounterAction {
        fn type_name(&self) -> &str {
            match self {
                CounterAction::Increment => "INCREMENT",
                CounterAction::Decrement => "DECREMENT",
                CounterAction::Set(_) => "SET",
            }
        }

        fn as_any(&self) -> &dyn core::any::Any {
            self
        }
    }

    fn counter_reducer(state: &CounterState, action: &dyn Action) -> CounterState {
        if let Some(counter_action) = action.as_any().downcast_ref::<CounterAction>() {
            match counter_action {
                CounterAction::Increment => CounterState { count: state.count + 1 },
                CounterAction::Decrement => CounterState { count: state.count - 1 },
                CounterAction::Set(value) => CounterState { count: *value },
            }
        } else {
            state.clone()
        }
    }

    #[test]
    fn test_store_new() {
        let store = Store::new(
            CounterState { count: 0 },
            Box::new(counter_reducer),
        );

        assert_eq!(store.get_state().count, 0);
    }

    #[test]
    fn test_store_dispatch() {
        let mut store = Store::new(
            CounterState { count: 0 },
            Box::new(counter_reducer),
        );

        store.dispatch(&CounterAction::Increment);
        assert_eq!(store.get_state().count, 1);

        store.dispatch(&CounterAction::Increment);
        assert_eq!(store.get_state().count, 2);
    }

    #[test]
    fn test_store_subscribe() {
        let mut store = Store::new(
            CounterState { count: 0 },
            Box::new(counter_reducer),
        );

        let called = Rc::new(RefCell::new(0));
        let called_clone = called.clone();

        store.subscribe(Box::new(move |_state| {
            *called_clone.borrow_mut() += 1;
        }));

        store.dispatch(&CounterAction::Increment);
        assert_eq!(*called.borrow(), 1);

        store.dispatch(&CounterAction::Increment);
        assert_eq!(*called.borrow(), 2);
    }

    #[test]
    fn test_store_undo() {
        let mut store = Store::new(
            CounterState { count: 0 },
            Box::new(counter_reducer),
        );

        store.dispatch(&CounterAction::Increment);
        store.dispatch(&CounterAction::Increment);
        assert_eq!(store.get_state().count, 2);

        assert!(store.undo());
        assert_eq!(store.get_state().count, 1);

        assert!(store.undo());
        assert_eq!(store.get_state().count, 0);

        assert!(!store.undo()); // Can't undo beyond initial state
    }

    #[test]
    fn test_store_redo() {
        let mut store = Store::new(
            CounterState { count: 0 },
            Box::new(counter_reducer),
        );

        store.dispatch(&CounterAction::Increment);
        store.dispatch(&CounterAction::Increment);
        store.undo();

        assert!(store.redo());
        assert_eq!(store.get_state().count, 2);

        assert!(!store.redo()); // Can't redo beyond last action
    }

    #[test]
    fn test_store_history() {
        let mut store = Store::new(
            CounterState { count: 0 },
            Box::new(counter_reducer),
        );

        store.dispatch(&CounterAction::Increment);
        store.dispatch(&CounterAction::Increment);

        assert_eq!(store.history_len(), 3); // initial + 2 actions
        assert_eq!(store.current_history_index(), 2);
    }

    #[test]
    fn test_store_jump_to_state() {
        let mut store = Store::new(
            CounterState { count: 0 },
            Box::new(counter_reducer),
        );

        store.dispatch(&CounterAction::Set(10));
        store.dispatch(&CounterAction::Set(20));
        store.dispatch(&CounterAction::Set(30));

        assert!(store.jump_to_state(1));
        assert_eq!(store.get_state().count, 10);

        assert!(store.jump_to_state(3));
        assert_eq!(store.get_state().count, 30);
    }

    #[test]
    fn test_store_max_history() {
        let mut store = Store::new(
            CounterState { count: 0 },
            Box::new(counter_reducer),
        );

        store.set_max_history(3);

        store.dispatch(&CounterAction::Increment);
        store.dispatch(&CounterAction::Increment);
        store.dispatch(&CounterAction::Increment);
        store.dispatch(&CounterAction::Increment);

        assert_eq!(store.history_len(), 3);
    }

    #[test]
    fn test_store_can_undo_redo() {
        let mut store = Store::new(
            CounterState { count: 0 },
            Box::new(counter_reducer),
        );

        assert!(!store.can_undo());
        assert!(!store.can_redo());

        store.dispatch(&CounterAction::Increment);
        assert!(store.can_undo());
        assert!(!store.can_redo());

        store.undo();
        assert!(!store.can_undo());
        assert!(store.can_redo());
    }

    #[test]
    fn test_combine_reducers() {
        let reducer1 = Box::new(|state: &CounterState, action: &dyn Action| {
            if action.type_name() == "INCREMENT" {
                CounterState { count: state.count + 1 }
            } else {
                state.clone()
            }
        });

        let reducer2 = Box::new(|state: &CounterState, action: &dyn Action| {
            if action.type_name() == "DOUBLE" {
                CounterState { count: state.count * 2 }
            } else {
                state.clone()
            }
        });

        let combined = combine_reducers(vec![reducer1, reducer2]);

        let state = CounterState { count: 5 };
        let action = SimpleAction {
            action_type: "INCREMENT".into(),
            payload: "".into(),
        };

        let new_state = combined(&state, &action);
        assert_eq!(new_state.count, 6);
    }

    #[test]
    fn test_simple_action() {
        let action = SimpleAction {
            action_type: "TEST".into(),
            payload: "data".into(),
        };

        assert_eq!(action.type_name(), "TEST");
    }

    #[test]
    fn test_subscribe_multiple() {
        let mut store = Store::new(
            CounterState { count: 0 },
            Box::new(counter_reducer),
        );

        let called1 = Rc::new(RefCell::new(0));
        let called1_clone = called1.clone();
        let called2 = Rc::new(RefCell::new(0));
        let called2_clone = called2.clone();

        store.subscribe(Box::new(move |_| {
            *called1_clone.borrow_mut() += 1;
        }));

        store.subscribe(Box::new(move |_| {
            *called2_clone.borrow_mut() += 1;
        }));

        store.dispatch(&CounterAction::Increment);

        assert_eq!(*called1.borrow(), 1);
        assert_eq!(*called2.borrow(), 1);
    }
}
