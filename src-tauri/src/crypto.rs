use std::{fs, path::PathBuf};

use aes_gcm::{
    Aes256Gcm, Key, KeyInit, Nonce,
    aead::{Aead, OsRng},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use rand::RngCore;
use tauri::{AppHandle, Manager};

const KEY_FILE: &str = "secret.key";
const NONCE_LEN: usize = 12;

fn key_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not access the key storage location: {error}"))?;
    Ok(dir.join(KEY_FILE))
}

fn data_key(app: &AppHandle) -> Result<[u8; 32], String> {
    let path = key_path(app)?;
    match fs::read(&path) {
        Ok(bytes) => {
            let key: [u8; 32] = bytes
                .try_into()
                .map_err(|_| "The stored encryption key is invalid.".to_string())?;
            Ok(key)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let mut key = [0u8; 32];
            OsRng.fill_bytes(&mut key);
            let dir = path
                .parent()
                .ok_or_else(|| "The key storage location is invalid.".to_string())?;
            fs::create_dir_all(dir)
                .map_err(|error| format!("Could not create the key storage location: {error}"))?;
            fs::write(&path, key)
                .map_err(|error| format!("Could not save the encryption key: {error}"))?;
            restrict_permissions(&path)?;
            Ok(key)
        }
        Err(error) => Err(format!("Could not read the encryption key: {error}")),
    }
}

#[cfg(unix)]
fn restrict_permissions(path: &std::path::Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|error| format!("Could not lock down the encryption key: {error}"))
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &std::path::Path) -> Result<(), String> {
    Ok(())
}

pub(crate) fn encrypt(app: &AppHandle, plaintext: &str) -> Result<String, String> {
    let key = data_key(app)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|_| "Could not encrypt the stored value.".to_string())?;
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(combined))
}

pub(crate) fn decrypt(app: &AppHandle, encoded: &str) -> Result<String, String> {
    let combined = BASE64
        .decode(encoded.as_bytes())
        .map_err(|_| "The stored value is not valid encrypted data.".to_string())?;
    if combined.len() <= NONCE_LEN {
        return Err("The stored encrypted value is incomplete.".to_string());
    }
    let (nonce_bytes, ciphertext) = combined.split_at(NONCE_LEN);
    let key = data_key(app)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Could not decrypt the stored value.".to_string())?;
    String::from_utf8(plaintext).map_err(|_| "The decrypted value is not valid text.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_round_trip_preserves_ciphertext_shape() {
        let combined = vec![1u8; NONCE_LEN + 16];
        let encoded = BASE64.encode(&combined);
        let decoded = BASE64.decode(encoded.as_bytes()).unwrap();
        assert_eq!(decoded.len(), NONCE_LEN + 16);
    }
}