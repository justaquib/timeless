use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GmailOAuthCallback {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) code: Option<String>,
    pub(crate) state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
}

pub(crate) fn parse_callback_request(request: &str) -> Result<GmailOAuthCallback, String> {
    let request_line = request
        .lines()
        .next()
        .ok_or_else(|| "Gmail sign-in callback request is invalid.".to_string())?;
    let mut parts = request_line.split_whitespace();
    if parts.next() != Some("GET") {
        return Err("Gmail sign-in callback must use GET.".into());
    }
    let target = parts
        .next()
        .filter(|target| target.starts_with('/'))
        .ok_or_else(|| "Gmail sign-in callback request is invalid.".to_string())?;
    let query = target
        .split_once('?')
        .map(|(_, query)| query)
        .ok_or_else(|| "Gmail sign-in callback did not include a result.".to_string())?;
    let mut code = None;
    let mut state = None;
    let mut error = None;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        let key = decode_query_component(key)?;
        let value = decode_query_component(value)?;
        match key.as_str() {
            "code" => code = Some(value),
            "state" => state = Some(value),
            "error" => error = Some(value),
            _ => {}
        }
    }
    Ok(GmailOAuthCallback {
        code,
        state: state.ok_or_else(|| "Gmail sign-in callback omitted state.".to_string())?,
        error,
    })
}

pub(crate) fn decode_query_component(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                decoded.push(b' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                let high = hex_value(bytes[index + 1])?;
                let low = hex_value(bytes[index + 2])?;
                decoded.push((high << 4) | low);
                index += 3;
            }
            b'%' => return Err("Gmail sign-in callback encoding is invalid.".into()),
            byte => {
                decoded.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8(decoded)
        .map_err(|error| format!("Gmail sign-in callback was not valid UTF-8: {error}"))
}

fn hex_value(byte: u8) -> Result<u8, String> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err("Gmail sign-in callback encoding is invalid.".into()),
    }
}
