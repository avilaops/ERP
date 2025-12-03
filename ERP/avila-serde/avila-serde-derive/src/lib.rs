use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, Data, DeriveInput, Fields, Variant};

#[proc_macro_derive(Serialize)]
pub fn derive_serialize(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);
    let name = &input.ident;

    let serialize_impl = match &input.data {
        Data::Struct(data) => generate_struct_serialize(name, &data.fields),
        Data::Enum(data) => generate_enum_serialize(name, &data.variants),
        _ => panic!("Serialize can only be derived for structs and enums"),
    };

    TokenStream::from(quote! {
        #serialize_impl
    })
}

#[proc_macro_derive(Deserialize)]
pub fn derive_deserialize(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);
    let name = &input.ident;

    let deserialize_impl = match &input.data {
        Data::Struct(data) => generate_struct_deserialize(name, &data.fields),
        Data::Enum(data) => generate_enum_deserialize(name, &data.variants),
        _ => panic!("Deserialize can only be derived for structs and enums"),
    };

    TokenStream::from(quote! {
        #deserialize_impl
    })
}

fn generate_struct_serialize(name: &syn::Ident, fields: &Fields) -> proc_macro2::TokenStream {
    match fields {
        Fields::Named(fields) => {
            let field_serializations = fields.named.iter().map(|f| {
                let field_name = &f.ident;
                let field_str = field_name.as_ref().unwrap().to_string();
                quote! {
                    map.insert(#field_str.to_string(), avila_serde::Serialize::to_value(&self.#field_name));
                }
            });

            quote! {
                impl avila_serde::Serialize for #name {
                    fn to_value(&self) -> avila_serde::Value {
                        let mut map = std::collections::HashMap::new();
                        #(#field_serializations)*
                        avila_serde::Value::Object(map)
                    }
                }
            }
        }
        Fields::Unnamed(fields) => {
            let field_serializations = (0..fields.unnamed.len()).map(|i| {
                let index = syn::Index::from(i);
                quote! {
                    vec.push(avila_serde::Serialize::to_value(&self.#index));
                }
            });

            quote! {
                impl avila_serde::Serialize for #name {
                    fn to_value(&self) -> avila_serde::Value {
                        let mut vec = Vec::new();
                        #(#field_serializations)*
                        avila_serde::Value::Array(vec)
                    }
                }
            }
        }
        Fields::Unit => {
            quote! {
                impl avila_serde::Serialize for #name {
                    fn to_value(&self) -> avila_serde::Value {
                        avila_serde::Value::String(stringify!(#name).to_string())
                    }
                }
            }
        }
    }
}

fn generate_enum_serialize(name: &syn::Ident, variants: &syn::punctuated::Punctuated<Variant, syn::token::Comma>) -> proc_macro2::TokenStream {
    let variant_arms = variants.iter().map(|variant| {
        let variant_name = &variant.ident;
        let variant_str = variant_name.to_string();

        match &variant.fields {
            Fields::Unit => {
                quote! {
                    #name::#variant_name => avila_serde::Value::String(#variant_str.to_string()),
                }
            }
            Fields::Named(fields) => {
                let field_names: Vec<_> = fields.named.iter()
                    .map(|f| f.ident.as_ref().unwrap())
                    .collect();

                let field_serializations = fields.named.iter().map(|f| {
                    let field_name = f.ident.as_ref().unwrap();
                    let field_str = field_name.to_string();
                    quote! {
                        map.insert(#field_str.to_string(), avila_serde::Serialize::to_value(#field_name));
                    }
                });

                quote! {
                    #name::#variant_name { #(#field_names),* } => {
                        let mut outer_map = std::collections::HashMap::new();
                        let mut map = std::collections::HashMap::new();
                        #(#field_serializations)*
                        outer_map.insert(#variant_str.to_string(), avila_serde::Value::Object(map));
                        avila_serde::Value::Object(outer_map)
                    },
                }
            }
            Fields::Unnamed(fields) => {
                let field_bindings: Vec<_> = (0..fields.unnamed.len())
                    .map(|i| syn::Ident::new(&format!("field_{}", i), proc_macro2::Span::call_site()))
                    .collect();

                let field_serializations = field_bindings.iter().map(|binding| {
                    quote! {
                        vec.push(avila_serde::Serialize::to_value(#binding));
                    }
                });

                quote! {
                    #name::#variant_name(#(#field_bindings),*) => {
                        let mut outer_map = std::collections::HashMap::new();
                        let mut vec = Vec::new();
                        #(#field_serializations)*
                        outer_map.insert(#variant_str.to_string(), avila_serde::Value::Array(vec));
                        avila_serde::Value::Object(outer_map)
                    },
                }
            }
        }
    });

    quote! {
        impl avila_serde::Serialize for #name {
            fn to_value(&self) -> avila_serde::Value {
                match self {
                    #(#variant_arms)*
                }
            }
        }
    }
}

fn generate_struct_deserialize(name: &syn::Ident, fields: &Fields) -> proc_macro2::TokenStream {
    match fields {
        Fields::Named(fields) => {
            let field_deserializations = fields.named.iter().map(|f| {
                let field_name = &f.ident;
                let field_str = field_name.as_ref().unwrap().to_string();
                quote! {
                    #field_name: {
                        let val = obj.get(#field_str)
                            .ok_or_else(|| avila_serde::Error::MissingField(#field_str.to_string()))?;
                        avila_serde::Deserialize::from_value(val.clone())?
                    },
                }
            });

            quote! {
                impl avila_serde::Deserialize for #name {
                    fn from_value(value: avila_serde::Value) -> std::result::Result<Self, avila_serde::Error> {
                        match value {
                            avila_serde::Value::Object(obj) => {
                                Ok(Self {
                                    #(#field_deserializations)*
                                })
                            }
                            _ => Err(avila_serde::Error::ExpectedObject),
                        }
                    }
                }
            }
        }
        Fields::Unnamed(fields) => {
            let field_deserializations = (0..fields.unnamed.len()).map(|i| {
                quote! {
                    avila_serde::Deserialize::from_value(
                        arr.get(#i)
                            .ok_or_else(|| avila_serde::Error::Parse(format!("Missing field at index {}", #i)))?
                            .clone()
                    )?,
                }
            });

            quote! {
                impl avila_serde::Deserialize for #name {
                    fn from_value(value: avila_serde::Value) -> std::result::Result<Self, avila_serde::Error> {
                        match value {
                            avila_serde::Value::Array(arr) => {
                                Ok(Self(
                                    #(#field_deserializations)*
                                ))
                            }
                            _ => Err(avila_serde::Error::Parse("Expected array".to_string())),
                        }
                    }
                }
            }
        }
        Fields::Unit => {
            quote! {
                impl avila_serde::Deserialize for #name {
                    fn from_value(value: avila_serde::Value) -> std::result::Result<Self, avila_serde::Error> {
                        match value {
                            avila_serde::Value::String(s) if s == stringify!(#name) => Ok(Self),
                            _ => Err(avila_serde::Error::Parse(format!("Expected {}", stringify!(#name)))),
                        }
                    }
                }
            }
        }
    }
}

fn generate_enum_deserialize(name: &syn::Ident, variants: &syn::punctuated::Punctuated<Variant, syn::token::Comma>) -> proc_macro2::TokenStream {
    let variant_matches = variants.iter().map(|variant| {
        let variant_name = &variant.ident;
        let variant_str = variant_name.to_string();

        match &variant.fields {
            Fields::Unit => {
                quote! {
                    avila_serde::Value::String(s) if s == #variant_str => Ok(#name::#variant_name),
                }
            }
            Fields::Named(fields) => {
                let field_deserializations = fields.named.iter().map(|f| {
                    let field_name = f.ident.as_ref().unwrap();
                    let field_str = field_name.to_string();
                    quote! {
                        #field_name: {
                            let val = inner_obj.get(#field_str)
                                .ok_or_else(|| avila_serde::Error::MissingField(#field_str.to_string()))?;
                            avila_serde::Deserialize::from_value(val.clone())?
                        }
                    }
                });

                quote! {
                    avila_serde::Value::Object(outer_obj) if outer_obj.contains_key(#variant_str) => {
                        if let avila_serde::Value::Object(inner_obj) = &outer_obj[#variant_str] {
                            Ok(#name::#variant_name {
                                #(#field_deserializations),*
                            })
                        } else {
                            Err(avila_serde::Error::Parse(format!("Expected object for variant {}", #variant_str)))
                        }
                    },
                }
            }
            Fields::Unnamed(fields) => {
                let field_deserializations = (0..fields.unnamed.len()).map(|i| {
                    quote! {
                        avila_serde::Deserialize::from_value(
                            inner_arr.get(#i)
                                .ok_or_else(|| avila_serde::Error::Parse(format!("Missing field at index {}", #i)))?
                                .clone()
                        )?,
                    }
                });

                quote! {
                    avila_serde::Value::Object(outer_obj) if outer_obj.contains_key(#variant_str) => {
                        if let avila_serde::Value::Array(inner_arr) = &outer_obj[#variant_str] {
                            Ok(#name::#variant_name(
                                #(#field_deserializations)*
                            ))
                        } else {
                            Err(avila_serde::Error::Parse(format!("Expected array for variant {}", #variant_str)))
                        }
                    },
                }
            }
        }
    });

    quote! {
        impl avila_serde::Deserialize for #name {
            fn from_value(value: avila_serde::Value) -> std::result::Result<Self, avila_serde::Error> {
                match value {
                    #(#variant_matches)*
                    _ => Err(avila_serde::Error::Parse(format!("Unknown variant for {}", stringify!(#name)))),
                }
            }
        }
    }
}
