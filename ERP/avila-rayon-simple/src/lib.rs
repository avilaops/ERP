// Simple parallel iterator replacement (sequential fallback)

pub trait IntoParallelIterator {
    type Item;
    type Iter: ParallelIterator<Item = Self::Item>;
    fn into_par_iter(self) -> Self::Iter;
}

pub trait ParallelIterator: Sized {
    type Item;

    fn for_each<F>(self, op: F)
    where
        F: Fn(Self::Item) + Sync + Send;
}

// Parallel slice operations
pub trait ParallelSlice<T: Sync> {
    fn par_chunks_mut(&mut self, chunk_size: usize) -> ChunksParMut<'_, T>;
}

impl<T: Sync> ParallelSlice<T> for [T] {
    fn par_chunks_mut(&mut self, chunk_size: usize) -> ChunksParMut<'_, T> {
        ChunksParMut::new(self, chunk_size)
    }
}

pub struct ChunksParMut<'a, T> {
    slice: &'a mut [T],
    chunk_size: usize,
    offset: usize,
}

impl<'a, T: Sync> ChunksParMut<'a, T> {
    fn new(slice: &'a mut [T], chunk_size: usize) -> Self {
        Self {
            slice,
            chunk_size,
            offset: 0,
        }
    }
}

impl<'a, T: Sync> Iterator for ChunksParMut<'a, T> {
    type Item = &'a mut [T];

    fn next(&mut self) -> Option<Self::Item> {
        if self.offset >= self.slice.len() {
            return None;
        }

        let end = (self.offset + self.chunk_size).min(self.slice.len());
        let slice_ptr = self.slice as *mut [T];

        unsafe {
            // Get pointer to start of chunk
            let ptr = (*slice_ptr).as_mut_ptr().add(self.offset);
            let chunk_len = end - self.offset;
            self.offset = end;
            Some(std::slice::from_raw_parts_mut(ptr, chunk_len))
        }
    }
}

impl<'a, T: Sync> ParallelIterator for ChunksParMut<'a, T> {
    type Item = &'a mut [T];

    fn for_each<F>(self, op: F)
    where
        F: Fn(Self::Item) + Sync + Send,
    {
        // Sequential fallback (para evitar dependência de threads)
        let slice_ptr = self.slice as *mut [T];
        unsafe {
            for chunk in (*slice_ptr).chunks_mut(self.chunk_size) {
                op(chunk);
            }
        }
    }
}

// Vec parallel iterator
impl<T: Send> IntoParallelIterator for Vec<T> {
    type Item = T;
    type Iter = VecParIter<T>;

    fn into_par_iter(self) -> Self::Iter {
        VecParIter { vec: self }
    }
}

pub struct VecParIter<T> {
    vec: Vec<T>,
}

impl<T: Send> ParallelIterator for VecParIter<T> {
    type Item = T;

    fn for_each<F>(self, op: F)
    where
        F: Fn(Self::Item) + Sync + Send,
    {
        // Sequential fallback
        for item in self.vec {
            op(item);
        }
    }
}

// Prelude module
pub mod prelude {
    pub use super::{IntoParallelIterator, ParallelIterator, ParallelSlice};
}
