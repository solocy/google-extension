# Chrome Web Store Listing Information

## Extension Name
QR Code Scanner

## Short Description (132 characters max)
Scan and decode QR codes on any webpage instantly. Supports multiple QR codes with one-click copy functionality.

## Detailed Description
QR Code Scanner is a lightweight, privacy-focused browser extension that allows you to scan and decode QR codes directly from any webpage.

**Key Features:**
• Instant QR code scanning - Just click the extension icon to scan
• Multiple QR code detection - Finds and lists all QR codes visible on the page
• One-click copy - Easily copy decoded content to clipboard
• Smart content detection - Automatically identifies URLs, emails, phone numbers, and WiFi configurations
• Privacy-first - All processing happens locally in your browser, no data is sent to external servers
• Lightweight - Minimal permissions required, fast and efficient

**How to Use:**
1. Navigate to a webpage containing QR codes
2. Click the QR Code Scanner icon in your browser toolbar
3. The extension automatically scans the visible area
4. Click on any detected QR code to select it
5. Click the copy button to copy the content

**Privacy:**
This extension only requires the "activeTab" permission to capture a screenshot of the current tab when you click the extension icon. No data is collected, stored, or transmitted. All QR code processing happens entirely within your browser.

**Supported QR Code Types:**
• URLs and website links
• Plain text
• Email addresses (mailto:)
• Phone numbers (tel:)
• WiFi network configurations

---

## Category
Productivity

## Language
English

---

## Privacy Policy

**QR Code Scanner Privacy Policy**

Last updated: January 2026

**Data Collection:**
QR Code Scanner does NOT collect, store, or transmit any personal data or browsing information.

**Permissions Used:**
- activeTab: Required to capture a screenshot of the current webpage when you click the extension icon. This permission only activates when you explicitly click the extension.

**Data Processing:**
All QR code scanning and decoding is performed locally within your browser. No images or decoded data are sent to external servers.

**Third-Party Services:**
This extension does not use any third-party analytics, tracking, or data processing services.

**Contact:**
For questions about this privacy policy, please create an issue on our GitHub repository.

---

## Single Purpose Description (For Google Review)

This extension serves a single purpose: to scan and decode QR codes visible on the current webpage.

When the user clicks the extension icon, it captures a screenshot of the visible tab area, processes the image locally to detect QR codes, and displays the decoded content for the user to copy.

**Justification for activeTab permission:**
The "activeTab" permission is required to use chrome.tabs.captureVisibleTab() API, which captures a screenshot of the current tab. This is the only way to obtain the webpage content for QR code scanning. The permission is only active when the user explicitly clicks the extension icon.

---

## Screenshots Suggestions

1. **Main Interface** - Show the popup with detected QR codes listed
2. **Multiple QR Codes** - Demonstrate scanning a page with multiple QR codes
3. **Copy Function** - Show the copy button in action
4. **No QR Code Found** - Show the empty state message

---

## Promotional Images Sizes Needed

- Small promo tile: 440x280 pixels
- Large promo tile: 920x680 pixels
- Marquee promo tile: 1400x560 pixels

---

## Version History

**v2.0.0**
- Support for multiple QR code detection
- New modern UI design
- One-click copy functionality
- Reduced permissions (removed unnecessary tabs and scripting permissions)
- Improved scanning algorithm

**v1.0.0**
- Initial release
- Basic QR code scanning functionality
