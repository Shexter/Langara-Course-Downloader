# Langara Swing Schedule Exporter

A browser extension that exports your Langara course schedule from the Swing (Ellucian Banner) system to ICS calendar format.

## Features

- Scrapes course data from the "By Course View" page
- Generates ICS calendar files with proper recurrence rules
- Handles Lectures, Labs, and Final Exams
- Automatically converts Banner date/time formats to standard calendar format
- One-click download of your complete semester schedule

## Installation

### Chrome/Edge (Manifest V3)

1. Clone or download this repository
2. Open Chrome/Edge and navigate to `chrome://extensions/` (or `edge://extensions/`)
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the extension directory

## Usage

1. Log into Langara Swing: `https://swing.langara.bc.ca`
2. Navigate to your course schedule
3. **Important:** Switch to the "By Course View" tab (not "By Week View")
4. Click the "Download Schedule (.ics)" button that appears above the course table
5. The ICS file will download automatically
6. Import the file into your calendar application (Google Calendar, Outlook, Apple Calendar, etc.)

## How It Works

The extension:
- Detects when you're on the Swing course schedule page
- Scrapes the HTML table containing your course data
- Parses Banner-specific formats:
  - Days: `-T-R---` → Tuesday, Thursday
  - Time: `1230-1420` → 12:30 PM - 2:20 PM
  - Dates: `06-MAY-2024` → Standard date format
- Generates recurring events for Lectures/Labs with proper `RRULE` entries
- Creates single events for Final Exams
- Downloads a complete ICS file ready for import

## File Structure

```
Langara ICS Download/
├── manifest.json          # Extension manifest (V3)
├── content.js             # Main content script (scraping + ICS generation)
├── content.css            # Styles for injected UI elements
├── icons/                 # Extension icons
└── README.md              # This file
```

## Browser Compatibility

- Chrome 88+ (Manifest V3)
- Edge 88+ (Manifest V3)

## Privacy

This extension:
- Only runs on `swing.langara.bc.ca` and `langara.ca` domains
- Processes data locally in your browser
- Does not send any data to external servers
- Does not store any personal information

## Troubleshooting

**Button doesn't appear:**
- Ensure you're on the "By Course View" page (not "By Week View")
- Refresh the page after loading the extension
- Check browser console for errors

**No courses found:**
- Verify you're logged into Swing and viewing your registered courses
- Ensure the table with course data is visible on the page

**ICS file doesn't open:**
- Try importing into a different calendar application
- Check that the file downloaded completely
- Verify the file extension is `.ics`

## Development

This extension uses:
- Manifest V3
- Vanilla JavaScript (no dependencies)
- Custom ICS generator (no external libraries)

## License

MIT License - Feel free to modify and distribute.

