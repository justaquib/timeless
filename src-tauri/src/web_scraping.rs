use std::{
    io::Read,
    net::{IpAddr, ToSocketAddrs},
    time::Duration,
};

use reqwest::{Url, blocking::Client, header::CONTENT_TYPE, redirect::Policy};
use serde::Serialize;

const MAX_PAGE_BYTES: u64 = 2 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(12);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScrapePageResponse {
    url: String,
    html: String,
}

#[tauri::command]
pub(crate) async fn fetch_scrape_page(url: String) -> Result<ScrapePageResponse, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_scrape_page_sync(&url))
        .await
        .map_err(|error| format!("Website fetch task failed: {error}"))?
}

fn fetch_scrape_page_sync(raw_url: &str) -> Result<ScrapePageResponse, String> {
    let url = validate_url(raw_url)?;
    let host = url
        .host_str()
        .ok_or_else(|| "Enter a website URL with a hostname.".to_string())?;
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "The website URL uses an unsupported port.".to_string())?;
    let lookup_host = host
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(host);
    let addresses: Vec<_> = (lookup_host, port)
        .to_socket_addrs()
        .map_err(|error| format!("Could not resolve the website hostname: {error}"))?
        .collect();
    if addresses.is_empty() || addresses.iter().any(|address| !is_public_ip(address.ip())) {
        return Err("The website must resolve only to public IP addresses.".into());
    }

    let original_scheme = url.scheme().to_string();
    let original_host = host.to_ascii_lowercase();
    let original_port = port;
    let mut client_builder = Client::builder().timeout(REQUEST_TIMEOUT);
    if lookup_host.parse::<IpAddr>().is_err() {
        client_builder = client_builder.resolve_to_addrs(lookup_host, &addresses);
    }
    let client = client_builder
        .redirect(Policy::custom(move |attempt| {
            let target = attempt.url();
            if target.scheme() == original_scheme
                && target
                    .host_str()
                    .is_some_and(|target_host| target_host.eq_ignore_ascii_case(&original_host))
                && target.port_or_known_default() == Some(original_port)
                && target.username().is_empty()
                && target.password().is_none()
                && attempt.previous().len() < 3
            {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|error| format!("Could not configure the website request: {error}"))?;

    let mut response = client
        .get(url)
        .header(reqwest::header::USER_AGENT, "Timeless/1.0 (website search)")
        .send()
        .map_err(|error| format!("Could not fetch the website: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "The website returned HTTP {}.",
            response.status().as_u16()
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_PAGE_BYTES)
    {
        return Err("The website page is larger than the 2 MB limit.".into());
    }
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !content_type.starts_with("text/html") && !content_type.starts_with("application/xhtml+xml")
    {
        return Err("The website did not return an HTML page.".into());
    }

    let mut bytes = Vec::new();
    response
        .by_ref()
        .take(MAX_PAGE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read the website page: {error}"))?;
    if bytes.len() as u64 > MAX_PAGE_BYTES {
        return Err("The website page is larger than the 2 MB limit.".into());
    }
    let html = String::from_utf8(bytes)
        .map_err(|_| "The website page is not valid UTF-8 HTML.".to_string())?;

    Ok(ScrapePageResponse {
        url: response.url().to_string(),
        html,
    })
}

fn validate_url(raw_url: &str) -> Result<Url, String> {
    let url = Url::parse(raw_url).map_err(|_| "Enter a valid website URL.".to_string())?;
    let host = url.host_str().unwrap_or_default();
    if !matches!(url.scheme(), "http" | "https")
        || host.is_empty()
        || !url.username().is_empty()
        || url.password().is_some()
        || host.eq_ignore_ascii_case("localhost")
        || host.to_ascii_lowercase().ends_with(".localhost")
        || host.to_ascii_lowercase().ends_with(".local")
    {
        return Err("Use a public HTTP or HTTPS website URL without embedded credentials.".into());
    }
    let host_ip = host
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(host);
    if let Ok(address) = host_ip.parse::<IpAddr>() {
        if !is_public_ip(address) {
            return Err("The website must resolve only to public IP addresses.".into());
        }
    }
    Ok(url)
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(address) => {
            let [first, second, third, _] = address.octets();
            !address.is_private()
                && !address.is_loopback()
                && !address.is_link_local()
                && !address.is_broadcast()
                && !address.is_multicast()
                && !address.is_unspecified()
                && first != 0
                && !(first == 100 && (64..=127).contains(&second))
                && !(first == 192 && second == 0 && third == 0)
                && !(first == 192 && second == 0 && third == 2)
                && !(first == 192 && second == 88 && third == 99)
                && !(first == 198 && (18..=19).contains(&second))
                && !(first == 198 && second == 51 && third == 100)
                && !(first == 203 && second == 0 && third == 113)
                && first < 224
        }
        IpAddr::V6(address) => {
            let segments = address.segments();
            segments[0] & 0xe000 == 0x2000
                && !(segments[0] == 0x2001 && matches!(segments[1], 0 | 2 | 0x0db8))
                && segments[0] != 0x2002
        }
    }
}

#[cfg(test)]
mod tests {
    use std::net::IpAddr;

    use super::{is_public_ip, validate_url};

    #[test]
    fn only_public_http_urls_without_credentials_are_accepted() {
        assert!(validate_url("https://example.com/jobs").is_ok());
        assert!(validate_url("http://example.com/jobs").is_ok());
        assert!(validate_url("file:///etc/passwd").is_err());
        assert!(validate_url("https://user:pass@example.com/").is_err());
        assert!(validate_url("http://127.0.0.1/").is_err());
        assert!(validate_url("http://[::1]/").is_err());
        assert!(validate_url("https://[2606:4700:4700::1111]/").is_ok());
    }

    #[test]
    fn blocks_private_and_reserved_ip_ranges() {
        for address in [
            "127.0.0.1",
            "10.1.2.3",
            "172.20.1.1",
            "192.168.1.1",
            "169.254.1.1",
            "100.64.1.1",
            "198.18.0.1",
            "203.0.113.1",
            "192.88.99.1",
            "::1",
            "2001:db8::1",
            "2001:2::1",
        ] {
            assert!(
                !is_public_ip(address.parse::<IpAddr>().unwrap()),
                "{address}"
            );
        }
        assert!(is_public_ip("8.8.8.8".parse().unwrap()));
        assert!(is_public_ip("2606:4700:4700::1111".parse().unwrap()));
    }
}
