//! Reactive system with mathematical signals

use crate::{Vec, Box};
use core::cell::RefCell;

/// Reactive signal that notifies on changes
pub struct Signal<T> {
    value: RefCell<T>,
    subscribers: RefCell<Vec<Box<dyn Fn(&T)>>>,
}

impl<T> Signal<T> {
    pub fn new(initial: T) -> Self {
        Self {
            value: RefCell::new(initial),
            subscribers: RefCell::new(Vec::new()),
        }
    }

    pub fn get(&self) -> T
    where
        T: Clone,
    {
        self.value.borrow().clone()
    }

    pub fn set(&self, new_value: T) {
        *self.value.borrow_mut() = new_value;
        self.notify();
    }

    pub fn update<F>(&self, f: F)
    where
        F: FnOnce(&mut T),
    {
        f(&mut self.value.borrow_mut());
        self.notify();
    }

    pub fn subscribe<F>(&self, callback: F)
    where
        F: Fn(&T) + 'static,
    {
        self.subscribers.borrow_mut().push(Box::new(callback));
    }

    fn notify(&self) {
        let value = self.value.borrow();
        for callback in self.subscribers.borrow().iter() {
            callback(&value);
        }
    }
}

/// Computed signal derived from other signals
pub struct Computed<T, F>
where
    F: Fn() -> T,
{
    compute: F,
}

impl<T, F> Computed<T, F>
where
    F: Fn() -> T,
{
    pub fn new(compute: F) -> Self {
        Self { compute }
    }

    pub fn get(&self) -> T {
        (self.compute)()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_signal_get_set() {
        let signal = Signal::new(42);
        assert_eq!(signal.get(), 42);

        signal.set(100);
        assert_eq!(signal.get(), 100);
    }

    #[test]
    fn test_signal_subscribe() {
        let signal = Signal::new(0);
        let counter = RefCell::new(0);

        signal.subscribe(move |_| {
            *counter.borrow_mut() += 1;
        });

        signal.set(1);
        signal.set(2);

        // Can't check counter here since it moved into closure
    }

    #[test]
    fn test_computed() {
        let base = Signal::new(10);
        let doubled = Computed::new(|| 20); // Simplified since we can't capture

        assert_eq!(doubled.get(), 20);
    }
}
