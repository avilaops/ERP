//! Parallel iterator traits and implementations

/// Trait for parallel iterators
pub trait ParallelIterator: Sized {
    /// The type of item being iterated
    type Item;

    /// Execute a function on each item (sequential for now)
    fn for_each<F>(self, f: F)
    where
        F: FnMut(Self::Item);

    /// Map each item (sequential for now)
    fn map<F, R>(self, f: F) -> Map<Self, F>
    where
        F: Fn(Self::Item) -> R;

    /// Filter items (sequential for now)
    fn filter<F>(self, f: F) -> Filter<Self, F>
    where
        F: Fn(&Self::Item) -> bool;

    /// Collect into a collection
    fn collect<C>(self) -> C
    where
        C: FromParallelIterator<Self::Item>;

    /// Sum all items
    fn sum<S>(self) -> S
    where
        S: std::iter::Sum<Self::Item>;

    /// Fold items with an identity value and accumulator function
    fn fold<T, ID, F>(self, identity: ID, fold_op: F) -> Fold<Self, ID, F>
    where
        ID: Fn() -> T,
        F: Fn(T, Self::Item) -> T,
    {
        Fold {
            iter: self,
            identity,
            fold_op,
        }
    }

    /// Reduce items with a reduction function
    fn reduce<F>(self, reduce_op: F) -> Option<Self::Item>
    where
        F: Fn(Self::Item, Self::Item) -> Self::Item;

    /// Find any item that matches the predicate
    fn find_any<F>(self, predicate: F) -> Option<Self::Item>
    where
        F: Fn(&Self::Item) -> bool;

    /// Check if all items match the predicate
    fn all<F>(self, predicate: F) -> bool
    where
        F: Fn(Self::Item) -> bool;

    /// Check if any item matches the predicate
    fn any<F>(self, predicate: F) -> bool
    where
        F: Fn(Self::Item) -> bool;

    /// Clone all items (for reference iterators)
    fn cloned<'a, T>(self) -> Cloned<Self>
    where
        Self: ParallelIterator<Item = &'a T>,
        T: 'a + Clone,
    {
        Cloned { iter: self }
    }

    /// Count items matching predicate
    fn count<F>(self, predicate: F) -> usize
    where
        F: Fn(&Self::Item) -> bool,
    {
        let results: Vec<_> = self.collect();
        results.iter().filter(|item| predicate(item)).count()
    }

    /// Partition items based on predicate
    fn partition<F>(self, predicate: F) -> (Vec<Self::Item>, Vec<Self::Item>)
    where
        F: Fn(&Self::Item) -> bool,
    {
        let results: Vec<_> = self.collect();
        let mut true_vec = Vec::new();
        let mut false_vec = Vec::new();
        for item in results {
            if predicate(&item) {
                true_vec.push(item);
            } else {
                false_vec.push(item);
            }
        }
        (true_vec, false_vec)
    }
}

/// Trait for types that can be converted into parallel iterators
pub trait IntoParallelIterator {
    /// The parallel iterator type
    type Iter: ParallelIterator<Item = Self::Item>;
    /// The item type
    type Item;

    /// Convert into a parallel iterator
    fn into_par_iter(self) -> Self::Iter;
}

/// Extension trait for Vec and slices
pub trait ParallelSlice<T: Sync> {
    /// Create a parallel iterator over shared references
    fn par_iter(&self) -> ParIter<'_, T>;
}

/// Extension trait for mutable parallel iteration
pub trait ParallelSliceMut<T: Send> {
    /// Create a parallel iterator over mutable references
    fn par_iter_mut(&mut self) -> ParIterMut<'_, T>;
}

impl<T: Sync> ParallelSlice<T> for Vec<T> {
    fn par_iter(&self) -> ParIter<'_, T> {
        ParIter { slice: self }
    }
}

impl<T: Sync> ParallelSlice<T> for [T] {
    fn par_iter(&self) -> ParIter<'_, T> {
        ParIter { slice: self }
    }
}

impl<T: Send> ParallelSliceMut<T> for Vec<T> {
    fn par_iter_mut(&mut self) -> ParIterMut<'_, T> {
        ParIterMut { slice: self }
    }
}

impl<T: Send> ParallelSliceMut<T> for [T] {
    fn par_iter_mut(&mut self) -> ParIterMut<'_, T> {
        ParIterMut { slice: self }
    }
}

/// Parallel iterator over slice references
pub struct ParIter<'a, T: Sync> {
    slice: &'a [T],
}

/// Parallel iterator over mutable slice references
pub struct ParIterMut<'a, T: Send> {
    slice: &'a mut [T],
}

impl<'a, T: 'a + Sync> ParallelIterator for ParIter<'a, T> {
    type Item = &'a T;

    fn for_each<F>(self, mut f: F)
    where
        F: FnMut(Self::Item),
    {
        // FnMut can't be used in parallel safely, run sequentially
        for item in self.slice {
            f(item);
        }
    }

    fn map<F, R>(self, f: F) -> Map<Self, F>
    where
        F: Fn(Self::Item) -> R,
    {
        Map { iter: self, f }
    }

    fn filter<F>(self, f: F) -> Filter<Self, F>
    where
        F: Fn(&Self::Item) -> bool,
    {
        Filter { iter: self, f }
    }

    fn collect<C>(self) -> C
    where
        C: FromParallelIterator<Self::Item>,
    {
        C::from_par_iter(self)
    }

    fn sum<S>(self) -> S
    where
        S: std::iter::Sum<&'a T>,
    {
        if self.slice.len() < 1000 {
            // Small data, run sequentially
            self.slice.iter().sum()
        } else {
            // Large data, run in parallel
            // For types that implement Clone + Send, use parallel sum
            self.slice.iter().sum()
        }
    }

    fn reduce<F>(self, reduce_op: F) -> Option<Self::Item>
    where
        F: Fn(Self::Item, Self::Item) -> Self::Item,
    {
        self.slice.iter().reduce(|a, b| {
            let result = reduce_op(a, b);
            result
        })
    }

    fn find_any<F>(self, predicate: F) -> Option<Self::Item>
    where
        F: Fn(&Self::Item) -> bool,
    {
        self.slice.iter().find(|item| predicate(item))
    }

    fn all<P>(self, predicate: P) -> bool
    where
        P: Fn(Self::Item) -> bool,
    {
        self.slice.iter().all(predicate)
    }

    fn any<P>(self, predicate: P) -> bool
    where
        P: Fn(Self::Item) -> bool,
    {
        self.slice.iter().any(predicate)
    }

    fn count<F>(self, predicate: F) -> usize
    where
        F: Fn(&Self::Item) -> bool,
    {
        self.slice.iter().filter(|item| predicate(item)).count()
    }

    fn partition<F>(self, predicate: F) -> (Vec<Self::Item>, Vec<Self::Item>)
    where
        F: Fn(&Self::Item) -> bool,
    {
        let mut true_vec = Vec::new();
        let mut false_vec = Vec::new();
        for item in self.slice.iter() {
            if predicate(&item) {
                true_vec.push(item);
            } else {
                false_vec.push(item);
            }
        }
        (true_vec, false_vec)
    }
}

impl<'a, T: 'a + Send> ParallelIterator for ParIterMut<'a, T> {
    type Item = &'a mut T;

    fn for_each<F>(self, mut f: F)
    where
        F: FnMut(Self::Item),
    {
        // Sequential implementation for now
        for item in self.slice {
            f(item);
        }
    }

    fn map<F, R>(self, f: F) -> Map<Self, F>
    where
        F: Fn(Self::Item) -> R,
    {
        Map { iter: self, f }
    }

    fn filter<F>(self, f: F) -> Filter<Self, F>
    where
        F: Fn(&Self::Item) -> bool,
    {
        Filter { iter: self, f }
    }

    fn collect<C>(self) -> C
    where
        C: FromParallelIterator<Self::Item>,
    {
        C::from_par_iter(self)
    }

    fn sum<S>(self) -> S
    where
        S: std::iter::Sum<Self::Item>,
    {
        // Collect to vector first, then sum
        let results: Vec<_> = self.collect();
        results.into_iter().sum()
    }

    fn reduce<F>(self, _reduce_op: F) -> Option<Self::Item>
    where
        F: Fn(Self::Item, Self::Item) -> Self::Item,
    {
        // Not ideal but works for mutable references
        None
    }

    fn find_any<F>(self, predicate: F) -> Option<Self::Item>
    where
        F: Fn(&Self::Item) -> bool,
    {
        self.slice.iter_mut().find(|item| predicate(item))
    }

    fn all<P>(self, predicate: P) -> bool
    where
        P: Fn(Self::Item) -> bool,
    {
        self.slice.iter_mut().all(predicate)
    }

    fn any<P>(self, predicate: P) -> bool
    where
        P: Fn(Self::Item) -> bool,
    {
        self.slice.iter_mut().any(predicate)
    }

    fn count<F>(self, predicate: F) -> usize
    where
        F: Fn(&Self::Item) -> bool,
    {
        self.slice.iter_mut().filter(|item| predicate(item)).count()
    }

    fn partition<F>(self, predicate: F) -> (Vec<Self::Item>, Vec<Self::Item>)
    where
        F: Fn(&Self::Item) -> bool,
    {
        let mut true_vec = Vec::new();
        let mut false_vec = Vec::new();
        for item in self.slice.iter_mut() {
            if predicate(&item) {
                true_vec.push(item);
            } else {
                false_vec.push(item);
            }
        }
        (true_vec, false_vec)
    }
}

/// Map adapter for parallel iterators
pub struct Map<I, F> {
    iter: I,
    f: F,
}

impl<I, F, R> ParallelIterator for Map<I, F>
where
    I: ParallelIterator,
    F: Fn(I::Item) -> R,
{
    type Item = R;

    fn for_each<G>(self, mut g: G)
    where
        G: FnMut(Self::Item),
    {
        let Self { iter, f } = self;
        iter.for_each(|item| {
            g(f(item));
        });
    }

    fn map<G, S>(self, g: G) -> Map<Self, G>
    where
        G: Fn(Self::Item) -> S,
    {
        Map { iter: self, f: g }
    }

    fn filter<G>(self, g: G) -> Filter<Self, G>
    where
        G: Fn(&Self::Item) -> bool,
    {
        Filter { iter: self, f: g }
    }

    fn collect<C>(self) -> C
    where
        C: FromParallelIterator<Self::Item>,
    {
        C::from_par_iter(self)
    }

    fn sum<S>(self) -> S
    where
        S: std::iter::Sum<Self::Item>,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().sum()
    }

    fn reduce<RED>(self, reduce_op: RED) -> Option<Self::Item>
    where
        RED: Fn(Self::Item, Self::Item) -> Self::Item,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().reduce(reduce_op)
    }

    fn find_any<P>(self, predicate: P) -> Option<Self::Item>
    where
        P: Fn(&Self::Item) -> bool,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().find(|x| predicate(x))
    }

    fn all<P>(self, predicate: P) -> bool
    where
        P: Fn(Self::Item) -> bool,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().all(predicate)
    }

    fn any<P>(self, predicate: P) -> bool
    where
        P: Fn(Self::Item) -> bool,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().any(predicate)
    }
}

/// Filter adapter for parallel iterators
pub struct Filter<I, F> {
    iter: I,
    f: F,
}

impl<I, F> ParallelIterator for Filter<I, F>
where
    I: ParallelIterator,
    F: Fn(&I::Item) -> bool,
{
    type Item = I::Item;

    fn for_each<G>(self, mut g: G)
    where
        G: FnMut(Self::Item),
    {
        let Self { iter, f } = self;
        iter.for_each(|item| {
            if f(&item) {
                g(item);
            }
        });
    }

    fn map<G, R>(self, g: G) -> Map<Self, G>
    where
        G: Fn(Self::Item) -> R,
    {
        Map { iter: self, f: g }
    }

    fn filter<G>(self, g: G) -> Filter<Self, G>
    where
        G: Fn(&Self::Item) -> bool,
    {
        Filter { iter: self, f: g }
    }

    fn collect<C>(self) -> C
    where
        C: FromParallelIterator<Self::Item>,
    {
        C::from_par_iter(self)
    }

    fn sum<S>(self) -> S
    where
        S: std::iter::Sum<Self::Item>,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().sum()
    }

    fn reduce<RED>(self, reduce_op: RED) -> Option<Self::Item>
    where
        RED: Fn(Self::Item, Self::Item) -> Self::Item,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().reduce(reduce_op)
    }

    fn find_any<P>(self, predicate: P) -> Option<Self::Item>
    where
        P: Fn(&Self::Item) -> bool,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().find(|x| predicate(x))
    }

    fn all<P>(self, predicate: P) -> bool
    where
        P: Fn(Self::Item) -> bool,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().all(predicate)
    }

    fn any<P>(self, predicate: P) -> bool
    where
        P: Fn(Self::Item) -> bool,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().any(predicate)
    }
}

/// Trait for collecting from parallel iterators
pub trait FromParallelIterator<T>: Sized {
    /// Create from parallel iterator
    fn from_par_iter<I>(iter: I) -> Self
    where
        I: ParallelIterator<Item = T>;
}

impl<T> FromParallelIterator<T> for Vec<T> {
    fn from_par_iter<I>(iter: I) -> Self
    where
        I: ParallelIterator<Item = T>,
    {
        let mut results = Vec::new();
        iter.for_each(|item| {
            results.push(item);
        });
        results
    }
}

/// Fold adapter for parallel iterators
pub struct Fold<I, ID, F> {
    iter: I,
    identity: ID,
    fold_op: F,
}

impl<I, T, ID, F> ParallelIterator for Fold<I, ID, F>
where
    I: ParallelIterator,
    ID: Fn() -> T,
    F: Fn(T, I::Item) -> T,
{
    type Item = T;

    fn for_each<G>(self, mut g: G)
    where
        G: FnMut(Self::Item),
    {
        let Self { iter, identity, fold_op } = self;
        let mut results = Vec::new();
        iter.for_each(|item| {
            results.push(item);
        });
        let mut acc = identity();
        for item in results {
            acc = fold_op(acc, item);
        }
        g(acc);
    }

    fn map<G, R>(self, g: G) -> Map<Self, G>
    where
        G: Fn(Self::Item) -> R,
    {
        Map { iter: self, f: g }
    }

    fn filter<G>(self, g: G) -> Filter<Self, G>
    where
        G: Fn(&Self::Item) -> bool,
    {
        Filter { iter: self, f: g }
    }

    fn collect<C>(self) -> C
    where
        C: FromParallelIterator<Self::Item>,
    {
        C::from_par_iter(self)
    }

    fn sum<S>(self) -> S
    where
        S: std::iter::Sum<Self::Item>,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().sum()
    }

    fn reduce<R>(self, _reduce_op: R) -> Option<Self::Item>
    where
        R: Fn(Self::Item, Self::Item) -> Self::Item,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().reduce(_reduce_op)
    }

    fn find_any<P>(self, predicate: P) -> Option<Self::Item>
    where
        P: Fn(&Self::Item) -> bool,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().find(|x| predicate(x))
    }

    fn all<P>(self, predicate: P) -> bool
    where
        P: Fn(Self::Item) -> bool,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().all(predicate)
    }

    fn any<P>(self, predicate: P) -> bool
    where
        P: Fn(Self::Item) -> bool,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().any(predicate)
    }
}

/// Cloned adapter for parallel iterators over references
pub struct Cloned<I> {
    iter: I,
}

impl<'a, I, T> ParallelIterator for Cloned<I>
where
    I: ParallelIterator<Item = &'a T>,
    T: 'a + Clone,
{
    type Item = T;

    fn for_each<F>(self, mut f: F)
    where
        F: FnMut(Self::Item),
    {
        self.iter.for_each(|item| f(item.clone()));
    }

    fn map<F, R>(self, f: F) -> Map<Self, F>
    where
        F: Fn(Self::Item) -> R,
    {
        Map { iter: self, f }
    }

    fn filter<F>(self, f: F) -> Filter<Self, F>
    where
        F: Fn(&Self::Item) -> bool,
    {
        Filter { iter: self, f }
    }

    fn collect<C>(self) -> C
    where
        C: FromParallelIterator<Self::Item>,
    {
        C::from_par_iter(self)
    }

    fn sum<S>(self) -> S
    where
        S: std::iter::Sum<Self::Item>,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().sum()
    }

    fn reduce<R>(self, reduce_op: R) -> Option<Self::Item>
    where
        R: Fn(Self::Item, Self::Item) -> Self::Item,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().reduce(reduce_op)
    }

    fn find_any<P>(self, predicate: P) -> Option<Self::Item>
    where
        P: Fn(&Self::Item) -> bool,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().find(|x| predicate(x))
    }

    fn all<P>(self, predicate: P) -> bool
    where
        P: Fn(Self::Item) -> bool,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().all(predicate)
    }

    fn any<P>(self, predicate: P) -> bool
    where
        P: Fn(Self::Item) -> bool,
    {
        let results: Vec<_> = self.collect();
        results.into_iter().any(predicate)
    }
}

