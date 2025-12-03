/// Sistema de gerenciamento de estado do Avila Framework
use std::cell::RefCell;
use std::rc::Rc;

pub struct State<T> {
    value: Rc<RefCell<T>>,
    listeners: Rc<RefCell<Vec<Box<dyn Fn(&T)>>>>,
}

impl<T: Clone> State<T> {
    pub fn new(initial: T) -> Self {
        Self {
            value: Rc::new(RefCell::new(initial)),
            listeners: Rc::new(RefCell::new(Vec::new())),
        }
    }

    pub fn get(&self) -> T {
        self.value.borrow().clone()
    }

    pub fn set(&self, new_value: T) {
        *self.value.borrow_mut() = new_value.clone();
        for listener in self.listeners.borrow().iter() {
            listener(&new_value);
        }
    }

    pub fn update<F>(&self, updater: F)
    where
        F: FnOnce(&mut T),
    {
        updater(&mut self.value.borrow_mut());
        let value = self.value.borrow().clone();
        for listener in self.listeners.borrow().iter() {
            listener(&value);
        }
    }

    pub fn subscribe<F>(&self, listener: F)
    where
        F: Fn(&T) + 'static,
    {
        self.listeners.borrow_mut().push(Box::new(listener));
    }
}

impl<T: Clone> Clone for State<T> {
    fn clone(&self) -> Self {
        Self {
            value: self.value.clone(),
            listeners: self.listeners.clone(),
        }
    }
}
