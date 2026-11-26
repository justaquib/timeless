use crate::gmail_auth_callback::{decode_query_component, parse_callback_request};

use super::{is_client_id_error, is_gmail_api_disabled_error, is_missing_client_secret_error};

#[test]
fn client_id_errors_are_distinguished_from_user_or_scope_errors() {
    assert!(is_client_id_error("invalid_client"));
    assert!(is_client_id_error("unauthorized_client"));
    assert!(is_client_id_error("deleted_client"));
    assert!(!is_client_id_error("access_denied"));
}

#[test]
fn missing_client_secret_errors_are_detected() {
    assert!(is_missing_client_secret_error("client_secret is missing"));
    assert!(!is_missing_client_secret_error("invalid_grant"));
}

#[test]
fn disabled_gmail_api_errors_are_recognized_from_google_error_reasons() {
    let body = r#"{"error":{"errors":[{"reason":"accessNotConfigured"}],"details":[{"reason":"SERVICE_DISABLED"}]}}"#;
    assert!(is_gmail_api_disabled_error(body));
    assert!(!is_gmail_api_disabled_error(
        r#"{"error":{"errors":[{"reason":"invalid_grant"}]}}"#
    ));
    assert!(!is_gmail_api_disabled_error("not json"));
}

#[test]
fn callback_parser_decodes_code_and_state_and_carries_google_errors() {
    let callback = parse_callback_request(
        "GET /oauth2callback?code=4%2Fabc%2Bdef&state=state-123&scope=mail HTTP/1.1",
    )
    .unwrap();
    assert_eq!(callback.code.as_deref(), Some("4/abc+def"));
    assert_eq!(callback.state, "state-123");
    assert!(callback.error.is_none());

    let callback =
        parse_callback_request("GET /?error=access_denied&state=state-123 HTTP/1.1").unwrap();
    assert_eq!(callback.error.as_deref(), Some("access_denied"));
}

#[test]
fn callback_parser_rejects_malformed_percent_escapes() {
    assert!(decode_query_component("%G0").is_err());
    assert!(
        parse_callback_request("GET /?code=x HTTP/1.1")
            .unwrap_err()
            .contains("omitted state")
    );
}
