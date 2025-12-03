//! Event system for user interactions and custom events
//!
//! This module provides a comprehensive event handling system with
//! event dispatching, bubbling, capturing, and preventDefault support.
//!
//! # Features
//! - Mouse events (click, move, down, up, wheel)
//! - Keyboard events (keydown, keyup, keypress)
//! - Touch events (touchstart, touchmove, touchend)
//! - Custom events
//! - Event bubbling and capturing phases
//! - Event delegation
//! - Prevent default and stop propagation

use crate::{Vec, Box, String};
use core::cell::RefCell;

/// Event phase
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventPhase {
    /// Event is capturing down the tree
    Capturing,
    /// Event is at the target
    AtTarget,
    /// Event is bubbling up the tree
    Bubbling,
}

/// Mouse button
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MouseButton {
    Left,
    Middle,
    Right,
    Back,
    Forward,
}

/// Keyboard key
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Key {
    pub code: String,
    pub key: String,
}

impl Key {
    pub fn new(code: String, key: String) -> Self {
        Self { code, key }
    }
}

/// Modifier keys state
#[derive(Debug, Clone, Copy, Default)]
pub struct Modifiers {
    pub shift: bool,
    pub ctrl: bool,
    pub alt: bool,
    pub meta: bool,
}

impl Modifiers {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_shift(mut self) -> Self {
        self.shift = true;
        self
    }

    pub fn with_ctrl(mut self) -> Self {
        self.ctrl = true;
        self
    }

    pub fn with_alt(mut self) -> Self {
        self.alt = true;
        self
    }

    pub fn with_meta(mut self) -> Self {
        self.meta = true;
        self
    }

    pub fn any(&self) -> bool {
        self.shift || self.ctrl || self.alt || self.meta
    }
}

/// Mouse event data
#[derive(Debug, Clone)]
pub struct MouseEventData {
    pub x: f64,
    pub y: f64,
    pub button: MouseButton,
    pub buttons: u8,
    pub modifiers: Modifiers,
}

impl MouseEventData {
    pub fn new(x: f64, y: f64, button: MouseButton) -> Self {
        Self {
            x,
            y,
            button,
            buttons: 0,
            modifiers: Modifiers::default(),
        }
    }

    /// Check if left button is pressed
    pub fn is_left_pressed(&self) -> bool {
        self.buttons & 0x01 != 0
    }

    /// Check if right button is pressed
    pub fn is_right_pressed(&self) -> bool {
        self.buttons & 0x02 != 0
    }

    /// Check if middle button is pressed
    pub fn is_middle_pressed(&self) -> bool {
        self.buttons & 0x04 != 0
    }
}

/// Keyboard event data
#[derive(Debug, Clone)]
pub struct KeyboardEventData {
    pub key: Key,
    pub modifiers: Modifiers,
    pub repeat: bool,
}

impl KeyboardEventData {
    pub fn new(code: String, key: String) -> Self {
        Self {
            key: Key::new(code, key),
            modifiers: Modifiers::default(),
            repeat: false,
        }
    }

    pub fn is_printable(&self) -> bool {
        self.key.key.len() == 1
    }

    pub fn is_navigation(&self) -> bool {
        matches!(
            self.key.code.as_str(),
            "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End" | "PageUp" | "PageDown"
        )
    }
}

/// Touch point data
#[derive(Debug, Clone)]
pub struct TouchPoint {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub force: f64,
}

impl TouchPoint {
    pub fn new(id: u32, x: f64, y: f64) -> Self {
        Self {
            id,
            x,
            y,
            force: 1.0,
        }
    }
}

/// Touch event data
#[derive(Debug, Clone)]
pub struct TouchEventData {
    pub touches: Vec<TouchPoint>,
}

impl TouchEventData {
    pub fn new() -> Self {
        Self {
            touches: Vec::new(),
        }
    }

    pub fn add_touch(&mut self, touch: TouchPoint) {
        self.touches.push(touch);
    }

    pub fn touch_count(&self) -> usize {
        self.touches.len()
    }

    /// Get centroid of all touches
    pub fn centroid(&self) -> Option<(f64, f64)> {
        if self.touches.is_empty() {
            return None;
        }

        let sum: (f64, f64) = self.touches.iter().fold((0.0, 0.0), |acc, t| {
            (acc.0 + t.x, acc.1 + t.y)
        });

        let count = self.touches.len() as f64;
        Some((sum.0 / count, sum.1 / count))
    }
}

/// Wheel event data
#[derive(Debug, Clone)]
pub struct WheelEventData {
    pub delta_x: f64,
    pub delta_y: f64,
    pub delta_z: f64,
    pub modifiers: Modifiers,
}

impl WheelEventData {
    pub fn new(delta_x: f64, delta_y: f64) -> Self {
        Self {
            delta_x,
            delta_y,
            delta_z: 0.0,
            modifiers: Modifiers::default(),
        }
    }
}

/// Event type enumeration
#[derive(Debug, Clone)]
pub enum EventType {
    // Mouse events
    Click(MouseEventData),
    DoubleClick(MouseEventData),
    MouseDown(MouseEventData),
    MouseUp(MouseEventData),
    MouseMove(MouseEventData),
    MouseEnter(MouseEventData),
    MouseLeave(MouseEventData),
    Wheel(WheelEventData),

    // Keyboard events
    KeyDown(KeyboardEventData),
    KeyUp(KeyboardEventData),
    KeyPress(KeyboardEventData),

    // Touch events
    TouchStart(TouchEventData),
    TouchMove(TouchEventData),
    TouchEnd(TouchEventData),
    TouchCancel(TouchEventData),

    // Focus events
    Focus,
    Blur,

    // Custom event with data
    Custom(String),
}

impl EventType {
    /// Get the event name as a string
    pub fn name(&self) -> &str {
        match self {
            EventType::Click(_) => "click",
            EventType::DoubleClick(_) => "dblclick",
            EventType::MouseDown(_) => "mousedown",
            EventType::MouseUp(_) => "mouseup",
            EventType::MouseMove(_) => "mousemove",
            EventType::MouseEnter(_) => "mouseenter",
            EventType::MouseLeave(_) => "mouseleave",
            EventType::Wheel(_) => "wheel",
            EventType::KeyDown(_) => "keydown",
            EventType::KeyUp(_) => "keyup",
            EventType::KeyPress(_) => "keypress",
            EventType::TouchStart(_) => "touchstart",
            EventType::TouchMove(_) => "touchmove",
            EventType::TouchEnd(_) => "touchend",
            EventType::TouchCancel(_) => "touchcancel",
            EventType::Focus => "focus",
            EventType::Blur => "blur",
            EventType::Custom(name) => name,
        }
    }
}

/// Event object
pub struct Event {
    pub event_type: EventType,
    pub phase: EventPhase,
    pub target_id: Option<u64>,
    pub current_target_id: Option<u64>,
    pub timestamp: f64,
    stopped: RefCell<bool>,
    prevented: RefCell<bool>,
}

impl Event {
    pub fn new(event_type: EventType) -> Self {
        Self {
            event_type,
            phase: EventPhase::AtTarget,
            target_id: None,
            current_target_id: None,
            timestamp: 0.0,
            stopped: RefCell::new(false),
            prevented: RefCell::new(false),
        }
    }

    /// Stop event propagation
    pub fn stop_propagation(&self) {
        *self.stopped.borrow_mut() = true;
    }

    /// Check if propagation is stopped
    pub fn is_propagation_stopped(&self) -> bool {
        *self.stopped.borrow()
    }

    /// Prevent default behavior
    pub fn prevent_default(&self) {
        *self.prevented.borrow_mut() = true;
    }

    /// Check if default is prevented
    pub fn is_default_prevented(&self) -> bool {
        *self.prevented.borrow()
    }
}

/// Event listener function type
pub type EventListener = Box<dyn Fn(&Event)>;

/// Event handler that manages listeners
pub struct EventHandler {
    listeners: RefCell<Vec<(String, EventListener)>>,
}

impl EventHandler {
    pub fn new() -> Self {
        Self {
            listeners: RefCell::new(Vec::new()),
        }
    }

    /// Add an event listener
    pub fn add_listener<F>(&self, event_name: String, listener: F)
    where
        F: Fn(&Event) + 'static,
    {
        self.listeners
            .borrow_mut()
            .push((event_name, Box::new(listener)));
    }

    /// Remove all listeners for an event type
    pub fn remove_listeners(&self, event_name: &str) {
        self.listeners
            .borrow_mut()
            .retain(|(name, _)| name != event_name);
    }

    /// Dispatch an event to all matching listeners
    pub fn dispatch(&self, event: &Event) {
        let listeners = self.listeners.borrow();
        let event_name = event.event_type.name();

        for (name, listener) in listeners.iter() {
            if name == event_name {
                listener(event);
                if event.is_propagation_stopped() {
                    break;
                }
            }
        }
    }

    /// Get listener count for an event type
    pub fn listener_count(&self, event_name: &str) -> usize {
        self.listeners
            .borrow()
            .iter()
            .filter(|(name, _)| name == event_name)
            .count()
    }

    /// Clear all listeners
    pub fn clear(&self) {
        self.listeners.borrow_mut().clear();
    }
}

impl Default for EventHandler {
    fn default() -> Self {
        Self::new()
    }
}

/// Event dispatcher for managing event flow
pub struct EventDispatcher {
    handlers: RefCell<Vec<(u64, EventHandler)>>,
}

impl EventDispatcher {
    pub fn new() -> Self {
        Self {
            handlers: RefCell::new(Vec::new()),
        }
    }

    /// Register a handler for a target
    pub fn register(&self, target_id: u64, handler: EventHandler) {
        self.handlers.borrow_mut().push((target_id, handler));
    }

    /// Unregister a handler
    pub fn unregister(&self, target_id: u64) {
        self.handlers
            .borrow_mut()
            .retain(|(id, _)| *id != target_id);
    }

    /// Dispatch event to a specific target
    pub fn dispatch_to(&self, target_id: u64, event: &mut Event) {
        event.target_id = Some(target_id);
        event.current_target_id = Some(target_id);

        let handlers = self.handlers.borrow();
        if let Some((_, handler)) = handlers.iter().find(|(id, _)| *id == target_id) {
            handler.dispatch(event);
        }
    }

    /// Get handler for a target
    pub fn get_handler(&self, target_id: u64) -> Option<EventHandler> {
        let handlers = self.handlers.borrow();
        handlers
            .iter()
            .find(|(id, _)| *id == target_id)
            .map(|(_, handler)| {
                // Create a new handler with the same listeners
                let new_handler = EventHandler::new();
                let listeners = handler.listeners.borrow();
                for (name, _) in listeners.iter() {
                    // Note: Can't clone closures, this is a simplified version
                }
                new_handler
            })
    }
}

impl Default for EventDispatcher {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use core::cell::Cell;

    #[test]
    fn test_modifiers() {
        let mods = Modifiers::new()
            .with_shift()
            .with_ctrl();

        assert!(mods.shift);
        assert!(mods.ctrl);
        assert!(!mods.alt);
        assert!(!mods.meta);
        assert!(mods.any());
    }

    #[test]
    fn test_mouse_event_buttons() {
        let mut event = MouseEventData::new(10.0, 20.0, MouseButton::Left);
        event.buttons = 0x01; // Left button pressed

        assert!(event.is_left_pressed());
        assert!(!event.is_right_pressed());
        assert!(!event.is_middle_pressed());
    }

    #[test]
    fn test_keyboard_event() {
        let event = KeyboardEventData::new("KeyA".to_string(), "a".to_string());

        assert!(event.is_printable());
        assert!(!event.is_navigation());
    }

    #[test]
    fn test_keyboard_navigation() {
        let event = KeyboardEventData::new("ArrowUp".to_string(), "ArrowUp".to_string());

        assert!(!event.is_printable());
        assert!(event.is_navigation());
    }

    #[test]
    fn test_touch_centroid() {
        let mut touch_event = TouchEventData::new();
        touch_event.add_touch(TouchPoint::new(1, 0.0, 0.0));
        touch_event.add_touch(TouchPoint::new(2, 10.0, 10.0));

        let centroid = touch_event.centroid().unwrap();
        assert!((centroid.0 - 5.0).abs() < 1e-10);
        assert!((centroid.1 - 5.0).abs() < 1e-10);
    }

    #[test]
    fn test_touch_count() {
        let mut touch_event = TouchEventData::new();
        assert_eq!(touch_event.touch_count(), 0);

        touch_event.add_touch(TouchPoint::new(1, 0.0, 0.0));
        touch_event.add_touch(TouchPoint::new(2, 10.0, 10.0));
        assert_eq!(touch_event.touch_count(), 2);
    }

    #[test]
    fn test_event_type_name() {
        let click = EventType::Click(MouseEventData::new(0.0, 0.0, MouseButton::Left));
        assert_eq!(click.name(), "click");

        let keydown = EventType::KeyDown(KeyboardEventData::new("KeyA".to_string(), "a".to_string()));
        assert_eq!(keydown.name(), "keydown");
    }

    #[test]
    fn test_event_stop_propagation() {
        let event = Event::new(EventType::Focus);
        assert!(!event.is_propagation_stopped());

        event.stop_propagation();
        assert!(event.is_propagation_stopped());
    }

    #[test]
    fn test_event_prevent_default() {
        let event = Event::new(EventType::Focus);
        assert!(!event.is_default_prevented());

        event.prevent_default();
        assert!(event.is_default_prevented());
    }

    #[test]
    fn test_event_handler_add_listener() {
        let handler = EventHandler::new();
        let called = Cell::new(false);

        handler.add_listener("click".to_string(), move |_| {
            called.set(true);
        });

        assert_eq!(handler.listener_count("click"), 1);
    }

    #[test]
    fn test_event_handler_dispatch() {
        use alloc::rc::Rc;
        let handler = EventHandler::new();
        let call_count = Rc::new(Cell::new(0));
        let call_count_clone = call_count.clone();

        handler.add_listener("click".to_string(), move |_| {
            call_count_clone.set(call_count_clone.get() + 1);
        });

        let event = Event::new(EventType::Click(MouseEventData::new(0.0, 0.0, MouseButton::Left)));
        handler.dispatch(&event);

        assert_eq!(call_count.get(), 1);
    }

    #[test]
    fn test_event_handler_stop_propagation_in_listener() {
        use alloc::rc::Rc;
        let handler = EventHandler::new();
        let first_called = Rc::new(Cell::new(false));
        let second_called = Rc::new(Cell::new(false));

        let first_clone = first_called.clone();
        handler.add_listener("click".to_string(), move |e| {
            first_clone.set(true);
            e.stop_propagation();
        });

        let second_clone = second_called.clone();
        handler.add_listener("click".to_string(), move |_| {
            second_clone.set(true);
        });

        let event = Event::new(EventType::Click(MouseEventData::new(0.0, 0.0, MouseButton::Left)));
        handler.dispatch(&event);

        assert!(first_called.get());
        assert!(!second_called.get()); // Should not be called due to stop_propagation
    }

    #[test]
    fn test_event_handler_remove_listeners() {
        let handler = EventHandler::new();

        handler.add_listener("click".to_string(), |_| {});
        handler.add_listener("click".to_string(), |_| {});
        assert_eq!(handler.listener_count("click"), 2);

        handler.remove_listeners("click");
        assert_eq!(handler.listener_count("click"), 0);
    }

    #[test]
    fn test_event_handler_clear() {
        let handler = EventHandler::new();

        handler.add_listener("click".to_string(), |_| {});
        handler.add_listener("keydown".to_string(), |_| {});

        handler.clear();

        assert_eq!(handler.listener_count("click"), 0);
        assert_eq!(handler.listener_count("keydown"), 0);
    }

    #[test]
    fn test_event_dispatcher() {
        use alloc::rc::Rc;
        let dispatcher = EventDispatcher::new();
        let handler = EventHandler::new();
        let called = Rc::new(Cell::new(false));
        let called_clone = called.clone();

        handler.add_listener("click".to_string(), move |_| {
            called_clone.set(true);
        });

        dispatcher.register(1, handler);

        let mut event = Event::new(EventType::Click(MouseEventData::new(0.0, 0.0, MouseButton::Left)));
        dispatcher.dispatch_to(1, &mut event);

        assert!(called.get());
    }

    #[test]
    fn test_event_dispatcher_unregister() {
        let dispatcher = EventDispatcher::new();
        let handler = EventHandler::new();

        dispatcher.register(1, handler);
        dispatcher.unregister(1);

        // Dispatching should not crash even though handler was removed
        let mut event = Event::new(EventType::Focus);
        dispatcher.dispatch_to(1, &mut event);
    }

    #[test]
    fn test_wheel_event() {
        let wheel = WheelEventData::new(0.0, 10.0);
        assert_eq!(wheel.delta_x, 0.0);
        assert_eq!(wheel.delta_y, 10.0);
        assert_eq!(wheel.delta_z, 0.0);
    }

    #[test]
    fn test_custom_event() {
        let custom = EventType::Custom("myevent".to_string());
        assert_eq!(custom.name(), "myevent");
    }
}
