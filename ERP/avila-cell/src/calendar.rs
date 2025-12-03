//! Calendar invites (iCalendar format - RFC 5545)

use crate::mime::{MimePart, types};

/// Calendar event
#[derive(Debug, Clone)]
pub struct CalendarEvent {
    pub uid: String,
    pub summary: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: String,
    pub end: String,
    pub organizer: String,
    pub attendees: Vec<String>,
    pub status: EventStatus,
}

#[derive(Debug, Clone, PartialEq)]
pub enum EventStatus {
    Tentative,
    Confirmed,
    Cancelled,
}

impl CalendarEvent {
    pub fn new(uid: String, summary: String, start: String, end: String, organizer: String) -> Self {
        Self {
            uid,
            summary,
            description: None,
            location: None,
            start,
            end,
            organizer,
            attendees: Vec::new(),
            status: EventStatus::Tentative,
        }
    }

    pub fn with_description(mut self, description: String) -> Self {
        self.description = Some(description);
        self
    }

    pub fn with_location(mut self, location: String) -> Self {
        self.location = Some(location);
        self
    }

    pub fn add_attendee(mut self, email: String) -> Self {
        self.attendees.push(email);
        self
    }

    pub fn confirmed(mut self) -> Self {
        self.status = EventStatus::Confirmed;
        self
    }

    /// Generates iCalendar format
    pub fn to_icalendar(&self) -> String {
        let mut ical = String::new();

        ical.push_str("BEGIN:VCALENDAR\r\n");
        ical.push_str("VERSION:2.0\r\n");
        ical.push_str("PRODID:-//Avila Cell//Calendar//EN\r\n");
        ical.push_str("METHOD:REQUEST\r\n");
        ical.push_str("BEGIN:VEVENT\r\n");

        ical.push_str(&format!("UID:{}\r\n", self.uid));
        ical.push_str(&format!("SUMMARY:{}\r\n", self.summary));

        if let Some(desc) = &self.description {
            ical.push_str(&format!("DESCRIPTION:{}\r\n", desc));
        }

        if let Some(loc) = &self.location {
            ical.push_str(&format!("LOCATION:{}\r\n", loc));
        }

        ical.push_str(&format!("DTSTART:{}\r\n", self.format_datetime(&self.start)));
        ical.push_str(&format!("DTEND:{}\r\n", self.format_datetime(&self.end)));
        ical.push_str(&format!("ORGANIZER:mailto:{}\r\n", self.organizer));

        for attendee in &self.attendees {
            ical.push_str(&format!("ATTENDEE;RSVP=TRUE:mailto:{}\r\n", attendee));
        }

        let status = match self.status {
            EventStatus::Tentative => "TENTATIVE",
            EventStatus::Confirmed => "CONFIRMED",
            EventStatus::Cancelled => "CANCELLED",
        };
        ical.push_str(&format!("STATUS:{}\r\n", status));

        ical.push_str("END:VEVENT\r\n");
        ical.push_str("END:VCALENDAR\r\n");

        ical
    }

    /// Formats datetime for iCalendar
    fn format_datetime(&self, time: &str) -> String {
        time.to_string()
    }

    /// Creates MIME part for calendar invite
    pub fn to_mime_part(&self) -> MimePart {
        let ical = self.to_icalendar();

        MimePart {
            content_type: types::TEXT_CALENDAR.to_string(),
            content: ical.into_bytes(),
            encoding: crate::mime::TransferEncoding::QuotedPrintable,
            disposition: Some("inline".to_string()),
            filename: None,
            content_id: None,
        }
    }
}

/// Contact card (vCard format - RFC 6350)
#[derive(Debug, Clone)]
pub struct ContactCard {
    pub full_name: String,
    pub email: String,
    pub phone: Option<String>,
    pub organization: Option<String>,
    pub title: Option<String>,
}

impl ContactCard {
    pub fn new(full_name: String, email: String) -> Self {
        Self {
            full_name,
            email,
            phone: None,
            organization: None,
            title: None,
        }
    }

    pub fn with_phone(mut self, phone: String) -> Self {
        self.phone = Some(phone);
        self
    }

    pub fn with_organization(mut self, org: String, title: String) -> Self {
        self.organization = Some(org);
        self.title = Some(title);
        self
    }

    /// Generates vCard format
    pub fn to_vcard(&self) -> String {
        let mut vcard = String::new();

        vcard.push_str("BEGIN:VCARD\r\n");
        vcard.push_str("VERSION:4.0\r\n");
        vcard.push_str(&format!("FN:{}\r\n", self.full_name));
        vcard.push_str(&format!("EMAIL:{}\r\n", self.email));

        if let Some(phone) = &self.phone {
            vcard.push_str(&format!("TEL:{}\r\n", phone));
        }

        if let Some(org) = &self.organization {
            vcard.push_str(&format!("ORG:{}\r\n", org));
        }

        if let Some(title) = &self.title {
            vcard.push_str(&format!("TITLE:{}\r\n", title));
        }

        vcard.push_str("END:VCARD\r\n");
        vcard
    }

    /// Creates MIME part for vCard
    pub fn to_mime_part(&self) -> MimePart {
        let vcard = self.to_vcard();

        MimePart {
            content_type: "text/vcard".to_string(),
            content: vcard.into_bytes(),
            encoding: crate::mime::TransferEncoding::QuotedPrintable,
            disposition: Some("attachment".to_string()),
            filename: Some(format!("{}.vcf", self.full_name.replace(' ', "_"))),
            content_id: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calendar_event() {
        let start = "20250101T120000Z".to_string();
        let end = "20250101T130000Z".to_string();

        let event = CalendarEvent::new(
            "event123".to_string(),
            "Team Meeting".to_string(),
            start,
            end,
            "organizer@test.com".to_string(),
        ).with_location("Conference Room A".to_string());

        let ical = event.to_icalendar();
        assert!(ical.contains("BEGIN:VCALENDAR"));
        assert!(ical.contains("SUMMARY:Team Meeting"));
        assert!(ical.contains("LOCATION:Conference Room A"));
    }

    #[test]
    fn test_contact_card() {
        let card = ContactCard::new(
            "John Doe".to_string(),
            "john@example.com".to_string(),
        ).with_phone("+1234567890".to_string());

        let vcard = card.to_vcard();
        assert!(vcard.contains("BEGIN:VCARD"));
        assert!(vcard.contains("FN:John Doe"));
        assert!(vcard.contains("EMAIL:john@example.com"));
        assert!(vcard.contains("TEL:+1234567890"));
    }
}
