//! Exemplo de uso do avila-serde com derive
//!
//! Demonstra como substituir serde e serde_json

use avila_serde::{Deserialize, Serialize, Value};

#[cfg(feature = "derive")]
use avila_serde::{DeserializeDerive as Deserialize, SerializeDerive as Serialize};

// ============================================================================
// Exemplo 1: Struct simples com derives
// ============================================================================

#[cfg(feature = "derive")]
#[derive(Debug, Serialize, Deserialize)]
struct Person {
    name: String,
    age: i32,
    email: String,
}

// ============================================================================
// Exemplo 2: Struct aninhada
// ============================================================================

#[cfg(feature = "derive")]
#[derive(Debug, Serialize, Deserialize)]
struct Address {
    street: String,
    city: String,
    zip: String,
}

#[cfg(feature = "derive")]
#[derive(Debug, Serialize, Deserialize)]
struct Employee {
    name: String,
    position: String,
    address: Address,
}

// ============================================================================
// Exemplo 3: Uso manual (sem derives)
// ============================================================================

#[derive(Debug)]
struct Product {
    id: u64,
    name: String,
    price: f64,
}

impl avila_serde::Serialize for Product {
    fn to_value(&self) -> Value {
        let mut map = std::collections::HashMap::new();
        map.insert("id".to_string(), self.id.to_value());
        map.insert("name".to_string(), self.name.to_value());
        map.insert("price".to_string(), self.price.to_value());
        Value::Object(map)
    }
}

impl avila_serde::Deserialize for Product {
    fn from_value(value: Value) -> Result<Self, avila_serde::Error> {
        if let Value::Object(obj) = value {
            Ok(Product {
                id: u64::from_value(obj.get("id")
                    .ok_or_else(|| avila_serde::Error::MissingField("id".to_string()))?
                    .clone())?,
                name: String::from_value(obj.get("name")
                    .ok_or_else(|| avila_serde::Error::MissingField("name".to_string()))?
                    .clone())?,
                price: f64::from_value(obj.get("price")
                    .ok_or_else(|| avila_serde::Error::MissingField("price".to_string()))?
                    .clone())?,
            })
        } else {
            Err(avila_serde::Error::ExpectedObject)
        }
    }
}

fn main() {
    println!("=== Avila Serde Examples ===\n");

    // Exemplo com derives
    #[cfg(feature = "derive")]
    {
        let person = Person {
            name: "João Silva".to_string(),
            age: 30,
            email: "joao@example.com".to_string(),
        };

        // Serializar para JSON
        let json = person.to_json();
        println!("✅ Serialized Person:\n{}\n", json);

        // Pretty print
        let pretty = person.to_json_pretty();
        println!("✅ Pretty JSON:\n{}\n", pretty);

        // Desserializar
        match Person::from_json(&json) {
            Ok(p) => println!("✅ Deserialized: {:?}\n", p),
            Err(e) => println!("❌ Error: {}\n", e),
        }
    }

    // Exemplo manual
    let product = Product {
        id: 123,
        name: "Laptop".to_string(),
        price: 2999.99,
    };

    let json = product.to_json();
    println!("✅ Product JSON:\n{}\n", json);

    match Product::from_json(&json) {
        Ok(p) => println!("✅ Product deserialized: {:?}\n", p),
        Err(e) => println!("❌ Error: {}\n", e),
    }

    // Exemplo com tipos primitivos
    let numbers = vec![1, 2, 3, 4, 5];
    let json_numbers = numbers.to_json();
    println!("✅ Numbers JSON: {}\n", json_numbers);

    // Exemplo com Option
    let maybe_value: Option<String> = Some("Hello".to_string());
    let json_option = maybe_value.to_json();
    println!("✅ Option JSON: {}\n", json_option);

    println!("=== All examples completed ===");
}
