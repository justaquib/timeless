use crate::SmtpSettings;

const PERSONAL_LIMIT: usize = 400;
const WORKSPACE_LIMIT: usize = 1_600;

pub(super) fn default_account_type() -> String {
    "personal".into()
}

pub(crate) fn is_gmail(settings: &SmtpSettings) -> bool {
    settings.host.trim().eq_ignore_ascii_case("smtp.gmail.com")
}

pub(super) fn validate_account_type(account_type: &str) -> Result<(), String> {
    if matches!(account_type, "personal" | "workspace") {
        Ok(())
    } else {
        Err("Choose a supported Gmail account type.".into())
    }
}

pub(crate) fn daily_limit(account_type: &str) -> Result<usize, String> {
    match account_type {
        "personal" => Ok(PERSONAL_LIMIT),
        "workspace" => Ok(WORKSPACE_LIMIT),
        _ => Err("Choose a supported Gmail account type.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::{PERSONAL_LIMIT, WORKSPACE_LIMIT, daily_limit, validate_account_type};

    #[test]
    fn account_types_select_conservative_safety_limits() {
        assert_eq!(daily_limit("personal").unwrap(), PERSONAL_LIMIT);
        assert_eq!(daily_limit("workspace").unwrap(), WORKSPACE_LIMIT);
        assert!(daily_limit("unknown").is_err());
        assert!(validate_account_type("personal").is_ok());
        assert!(validate_account_type("workspace").is_ok());
        assert!(validate_account_type("unknown").is_err());
    }
}
