use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, Data, DeriveInput, Fields, Lit, Meta};

/// Derive macro para criar implementações de erro
/// Similar ao #[derive(thiserror::Error)]
#[proc_macro_derive(Error, attributes(error))]
pub fn derive_error(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);
    let _name = &input.ident;

    let display_impl = generate_display(&input);
    let error_impl = generate_error(&input);
    let from_impls = generate_from_impls(&input);

    let expanded = quote! {
        #display_impl
        #error_impl
        #from_impls
    };

    TokenStream::from(expanded)
}

fn generate_display(input: &DeriveInput) -> proc_macro2::TokenStream {
    let name = &input.ident;

    match &input.data {
        Data::Enum(data) => {
            let match_arms = data.variants.iter().map(|variant| {
                let variant_name = &variant.ident;

                // Procura por atributo #[error("...")]
                let error_msg = variant.attrs.iter()
                    .find_map(|attr| {
                        if attr.path().is_ident("error") {
                            if let Meta::NameValue(nv) = &attr.meta {
                                if let syn::Expr::Lit(expr_lit) = &nv.value {
                                    if let Lit::Str(s) = &expr_lit.lit {
                                        return Some(s.value());
                                    }
                                }
                            }
                        }
                        None
                    })
                    .unwrap_or_else(|| format!("{}", variant_name));

                match &variant.fields {
                    Fields::Unit => quote! {
                        #name::#variant_name => write!(f, #error_msg),
                    },
                    Fields::Unnamed(fields) if fields.unnamed.len() == 1 => {
                        // Para variants como Error::Io(source)
                        quote! {
                            #name::#variant_name(source) => write!(f, "{}: {}", #error_msg, source),
                        }
                    }
                    Fields::Named(_) => {
                        quote! {
                            #name::#variant_name { .. } => write!(f, #error_msg),
                        }
                    }
                    _ => quote! {
                        #name::#variant_name(..) => write!(f, #error_msg),
                    }
                }
            });

            quote! {
                impl std::fmt::Display for #name {
                    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        match self {
                            #(#match_arms)*
                        }
                    }
                }
            }
        }
        Data::Struct(_) => {
            // Para structs, procura atributo #[error("...")]
            let error_msg = input.attrs.iter()
                .find_map(|attr| {
                    if attr.path().is_ident("error") {
                        if let Meta::NameValue(nv) = &attr.meta {
                            if let syn::Expr::Lit(expr_lit) = &nv.value {
                                if let Lit::Str(s) = &expr_lit.lit {
                                    return Some(s.value());
                                }
                            }
                        }
                    }
                    None
                })
                .unwrap_or_else(|| format!("{}", name));

            quote! {
                impl std::fmt::Display for #name {
                    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(f, #error_msg)
                    }
                }
            }
        }
        _ => panic!("Error derive only supports structs and enums"),
    }
}

fn generate_error(input: &DeriveInput) -> proc_macro2::TokenStream {
    let name = &input.ident;

    match &input.data {
        Data::Enum(data) => {
            let source_arms = data.variants.iter().map(|variant| {
                let variant_name = &variant.ident;

                // Verifica se tem #[from] attribute
                let has_from = variant.attrs.iter().any(|attr| {
                    attr.path().is_ident("from")
                });

                if has_from {
                    match &variant.fields {
                        Fields::Unnamed(fields) if fields.unnamed.len() == 1 => {
                            return quote! {
                                #name::#variant_name(source) => Some(source),
                            };
                        }
                        _ => {}
                    }
                }

                quote! {
                    #name::#variant_name { .. } => None,
                }
            });

            quote! {
                impl std::error::Error for #name {
                    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
                        match self {
                            #(#source_arms)*
                        }
                    }
                }
            }
        }
        Data::Struct(_) => {
            quote! {
                impl std::error::Error for #name {}
            }
        }
        _ => panic!("Error derive only supports structs and enums"),
    }
}

fn generate_from_impls(input: &DeriveInput) -> proc_macro2::TokenStream {
    let name = &input.ident;

    match &input.data {
        Data::Enum(data) => {
            let from_impls = data.variants.iter().filter_map(|variant| {
                let variant_name = &variant.ident;

                // Procura por atributo #[from]
                let has_from = variant.attrs.iter().any(|attr| {
                    attr.path().is_ident("from")
                });

                if has_from {
                    match &variant.fields {
                        Fields::Unnamed(fields) if fields.unnamed.len() == 1 => {
                            let field_type = &fields.unnamed.first().unwrap().ty;
                            return Some(quote! {
                                impl From<#field_type> for #name {
                                    fn from(source: #field_type) -> Self {
                                        #name::#variant_name(source)
                                    }
                                }
                            });
                        }
                        _ => {}
                    }
                }
                None
            });

            quote! {
                #(#from_impls)*
            }
        }
        _ => quote! {},
    }
}
