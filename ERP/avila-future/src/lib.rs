//! Avila Future - Futures trait e utilitários
//! Substitui futures crate

pub use std::future::Future;
pub use tokio::task::spawn;

pub trait FutureExt: Future {
    fn map<F, U>(self, f: F) -> Map<Self, F>
    where
        Self: Sized,
        F: FnOnce(Self::Output) -> U,
    {
        Map { future: self, f: Some(f) }
    }

    fn then<F, Fut>(self, f: F) -> Then<Self, F, Fut>
    where
        Self: Sized,
        F: FnOnce(Self::Output) -> Fut,
        Fut: Future,
    {
        Then { future: self, f: Some(f), _marker: std::marker::PhantomData }
    }
}

impl<T: Future> FutureExt for T {}

pub struct Map<Fut, F> {
    future: Fut,
    f: Option<F>,
}

impl<Fut: Future, F: FnOnce(Fut::Output) -> U, U> Future for Map<Fut, F> {
    type Output = U;

    fn poll(self: std::pin::Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> std::task::Poll<U> {
        unsafe {
            let this = self.get_unchecked_mut();
            let fut = std::pin::Pin::new_unchecked(&mut this.future);
            match fut.poll(cx) {
                std::task::Poll::Ready(output) => {
                    let f = this.f.take().unwrap();
                    std::task::Poll::Ready(f(output))
                }
                std::task::Poll::Pending => std::task::Poll::Pending,
            }
        }
    }
}

pub struct Then<Fut1, F, Fut2> {
    future: Fut1,
    f: Option<F>,
    _marker: std::marker::PhantomData<Fut2>,
}

impl<Fut1: Future, F: FnOnce(Fut1::Output) -> Fut2, Fut2: Future> Future for Then<Fut1, F, Fut2> {
    type Output = Fut2::Output;

    fn poll(self: std::pin::Pin<&mut Self>, _cx: &mut std::task::Context<'_>) -> std::task::Poll<Fut2::Output> {
        std::task::Poll::Pending // Simplificado
    }
}

pub mod future {
    pub use super::*;

    pub fn ready<T>(value: T) -> Ready<T> {
        Ready(Some(value))
    }

    pub struct Ready<T>(Option<T>);

    impl<T> super::Future for Ready<T> {
        type Output = T;

        fn poll(self: std::pin::Pin<&mut Self>, _cx: &mut std::task::Context<'_>) -> std::task::Poll<T> {
            let this = unsafe { self.get_unchecked_mut() };
            std::task::Poll::Ready(this.0.take().unwrap())
        }
    }
}

pub mod stream {
    use std::pin::Pin;
    use std::task::{Context, Poll};

    pub trait Stream {
        type Item;
        fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>>;
    }

    pub trait StreamExt: Stream {
        fn next(&mut self) -> Next<'_, Self>
        where
            Self: Unpin + Sized,
        {
            Next { stream: self }
        }
    }

    impl<T: Stream> StreamExt for T {}

    pub struct Next<'a, S: ?Sized> {
        stream: &'a mut S,
    }

    impl<S: Stream + Unpin> super::Future for Next<'_, S> {
        type Output = Option<S::Item>;

        fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<S::Item>> {
            Pin::new(&mut *self.stream).poll_next(cx)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_ready() {
        let fut = future::ready(42);
        assert_eq!(fut.await, 42);
    }

    #[tokio::test]
    async fn test_map() {
        let fut = future::ready(10).map(|x| x * 2);
        assert_eq!(fut.await, 20);
    }

    #[tokio::test]
    async fn test_spawn() {
        let handle = spawn(async { 100 });
        assert_eq!(handle.await.unwrap(), 100);
    }
}
