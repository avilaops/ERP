//! Operations for automatic differentiation

use super::tape::{Operation, Tape};
use super::variable::Variable;

/// Add two variables
pub fn add(tape: &mut Tape, a: &Variable, b: &Variable) -> Variable {
    let value = a.value() + b.value();
    tape.record(
        value,
        Operation::Add {
            a: a.clone(),
            b: b.clone(),
        },
    )
}

/// Subtract two variables
pub fn sub(tape: &mut Tape, a: &Variable, b: &Variable) -> Variable {
    let value = a.value() - b.value();
    tape.record(
        value,
        Operation::Sub {
            a: a.clone(),
            b: b.clone(),
        },
    )
}

/// Multiply two variables
pub fn mul(tape: &mut Tape, a: &Variable, b: &Variable) -> Variable {
    let value = a.value() * b.value();
    tape.record(
        value,
        Operation::Mul {
            a: a.clone(),
            b: b.clone(),
        },
    )
}

/// Divide two variables
pub fn div(tape: &mut Tape, a: &Variable, b: &Variable) -> Variable {
    let value = a.value() / b.value();
    tape.record(
        value,
        Operation::Div {
            a: a.clone(),
            b: b.clone(),
        },
    )
}

/// Power (a^b where b is constant)
pub fn pow(tape: &mut Tape, a: &Variable, exponent: f64) -> Variable {
    let value = a.value().powf(exponent);
    tape.record(
        value,
        Operation::Pow {
            a: a.clone(),
            b: exponent,
        },
    )
}

/// Exponential
pub fn exp(tape: &mut Tape, a: &Variable) -> Variable {
    let value = a.value().exp();
    tape.record(value, Operation::Exp { a: a.clone() })
}

/// Natural logarithm
pub fn log(tape: &mut Tape, a: &Variable) -> Variable {
    let value = a.value().ln();
    tape.record(value, Operation::Log { a: a.clone() })
}

/// Sine
pub fn sin(tape: &mut Tape, a: &Variable) -> Variable {
    let value = a.value().sin();
    tape.record(value, Operation::Sin { a: a.clone() })
}

/// Cosine
pub fn cos(tape: &mut Tape, a: &Variable) -> Variable {
    let value = a.value().cos();
    tape.record(value, Operation::Cos { a: a.clone() })
}

/// Hyperbolic tangent
pub fn tanh(tape: &mut Tape, a: &Variable) -> Variable {
    let value = a.value().tanh();
    tape.record(value, Operation::Tanh { a: a.clone() })
}

/// ReLU activation
pub fn relu(tape: &mut Tape, a: &Variable) -> Variable {
    let value = a.value().max(0.0);
    tape.record(value, Operation::Relu { a: a.clone() })
}

/// Sigmoid activation
pub fn sigmoid(tape: &mut Tape, a: &Variable) -> Variable {
    let a_val = a.value();
    let value = 1.0 / (1.0 + (-a_val).exp());
    tape.record(value, Operation::Sigmoid { a: a.clone() })
}
