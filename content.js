// Langara Swing Schedule Exporter
// Content script for scraping course data and generating ICS files

(function() {
  'use strict';

  // Month abbreviation to number mapping
  const MONTH_MAP = {
    'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
    'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
    'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
  };

  // Banner day character to ICS BYDAY mapping
  const DAY_MAP = {
    'M': 'MO',  // Monday
    'T': 'TU',  // Tuesday
    'W': 'WE',  // Wednesday
    'R': 'TH',  // Thursday
    'F': 'FR',  // Friday
    'S': 'SA',  // Saturday
    'U': 'SU'   // Sunday
  };

  /**
   * Detects if user is on "By Course View" or "By Week View"
   * @returns {string} 'course' | 'week' | 'unknown'
   */
  function detectPageType() {
    const url = window.location.href;
    const pageText = document.body.innerText || '';
    
    // Check for "By Course View" indicators
    if (url.includes('course') || pageText.includes('By Course View') || 
        pageText.includes('Registered Courses')) {
      return 'course';
    }
    
    // Check for "By Week View" indicators
    if (url.includes('week') || pageText.includes('By Week View')) {
      return 'week';
    }
    
    // Try to find the data table - if it has Start/End columns, it's course view
    const table = findDataTable();
    if (table) {
      const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
      if (headers.includes('Start') && headers.includes('End')) {
        return 'course';
      }
    }
    
    return 'unknown';
  }

  /**
   * Finds the main data table containing course information
   * @returns {HTMLElement|null}
   */
  function findDataTable() {
    // First, try to find table specifically associated with "Registered Courses"
    // Look for headings or text that says "Registered Courses" and find nearby table
    const registeredCoursesHeaders = Array.from(document.querySelectorAll('h2, h3, h4, .pageheader, .header, th, td'))
      .filter(el => {
        const text = el.textContent.toUpperCase();
        return text.includes('REGISTERED') && text.includes('COURSE');
      });
    
    for (const header of registeredCoursesHeaders) {
      // Find the next table after this header
      let element = header.nextElementSibling;
      let depth = 0;
      while (element && depth < 10) { // Limit search depth
        if (element.tagName === 'TABLE') {
          const headers = Array.from(element.querySelectorAll('th')).map(th => th.textContent.trim());
          if (headers.length > 0 && headers.some(h => h.toUpperCase().includes('TYPE'))) {
            console.log('Found "Registered Courses" table via header search. Headers:', headers);
            return element;
          }
        }
        element = element.nextElementSibling;
        depth++;
      }
      
      // Also check parent container for tables
      let parent = header.parentElement;
      depth = 0;
      while (parent && depth < 5) {
        const table = parent.querySelector('table');
        if (table) {
          const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
          if (headers.length > 0 && headers.some(h => h.toUpperCase().includes('TYPE'))) {
            console.log('Found "Registered Courses" table in parent container. Headers:', headers);
            return table;
          }
        }
        parent = parent.parentElement;
        depth++;
      }
    }
    
    // Try multiple selectors to find the table
    const selectors = [
      '.datadisplaytable',
      'table.datadisplaytable',
      'table[summary*="course"]',
      'table[summary*="schedule"]',
      'table[summary*="Registered"]'
    ];

    for (const selector of selectors) {
      const tables = document.querySelectorAll(selector);
      for (const table of tables) {
        // Verify it has the expected structure (headers with Start/End or Type)
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
        if (headers.length > 0) {
          // Check for key columns that indicate this is the course schedule table
          const hasKeyColumns = headers.some(h => 
            h.toUpperCase().includes('TYPE') || 
            h.toUpperCase().includes('START') || 
            h.toUpperCase().includes('DAYS') ||
            (h.toUpperCase().includes('SUBJ') && h.toUpperCase().includes('CRSE'))
          );
          if (hasKeyColumns) {
            console.log('Found table with selector:', selector, 'Headers:', headers);
            return table;
          }
        }
      }
    }

    // Fallback: find any table with expected headers
    const allTables = document.querySelectorAll('table');
    for (const table of allTables) {
      const rows = table.querySelectorAll('tr');
      if (rows.length > 3) { // Likely a data table
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
        // Check if this table has the expected course schedule columns
        const headerText = headers.join(' ').toUpperCase();
        if (headerText.includes('TYPE') && (headerText.includes('START') || headerText.includes('DAYS'))) {
          console.log('Found table via fallback method. Headers:', headers);
          return table;
        }
      }
    }

    console.warn('Could not find course schedule table');
    return null;
  }

  /**
   * Parses a Banner date string (e.g., "06-MAY-2024") to ISO format
   * @param {string} dateStr - Banner date string
   * @returns {string|null} ISO date string (YYYYMMDD) or null if invalid
   */
  function parseBannerDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    
    const trimmed = dateStr.trim();
    const parts = trimmed.split('-');
    
    if (parts.length !== 3) return null;
    
    const day = parts[0].padStart(2, '0');
    const monthAbbr = parts[1].toUpperCase();
    const year = parts[2];
    
    if (!MONTH_MAP[monthAbbr]) return null;
    
    const month = MONTH_MAP[monthAbbr];
    
    // Validate date
    const date = new Date(`${year}-${month}-${day}`);
    if (isNaN(date.getTime())) return null;
    
    return `${year}${month}${day}`;
  }

  /**
   * Parses Banner time string (e.g., "1230-1420") to time components
   * @param {string} timeStr - Banner time string
   * @returns {Object|null} {start: "HH:MM", end: "HH:MM"} or null if invalid
   */
  function parseBannerTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    
    const trimmed = timeStr.trim();
    const parts = trimmed.split('-');
    
    if (parts.length !== 2) return null;
    
    const startRaw = parts[0].trim();
    const endRaw = parts[1].trim();
    
    // Format: 4 digits (HHMM) or 3 digits (HMM) - handle both
    const formatTime = (time) => {
      const padded = time.padStart(4, '0');
      const hours = padded.substring(0, padded.length - 2);
      const minutes = padded.substring(padded.length - 2);
      return `${hours.padStart(2, '0')}:${minutes}`;
    };
    
    return {
      start: formatTime(startRaw),
      end: formatTime(endRaw)
    };
  }

  /**
   * Parses Banner days string (e.g., "-T-R---") to ICS BYDAY array
   * @param {string} daysStr - Banner days string
   * @returns {string[]} Array of ICS day codes (e.g., ["TU", "TH"])
   */
  function parseBannerDays(daysStr) {
    if (!daysStr || typeof daysStr !== 'string') return [];
    
    const days = [];
    const trimmed = daysStr.trim().toUpperCase();
    
    // Position-based parsing: M T W R F S U
    const positions = ['M', 'T', 'W', 'R', 'F', 'S', 'U'];
    
    for (let i = 0; i < positions.length; i++) {
      if (trimmed.includes(positions[i])) {
        const icsDay = DAY_MAP[positions[i]];
        if (icsDay) {
          days.push(icsDay);
        }
      }
    }
    
    return days;
  }

  /**
   * Extracts column index by header text
   * Handles multi-row headers (common in Banner/Ellucian tables)
   * @param {HTMLElement} table - Table element
   * @param {string} headerText - Header text to find
   * @returns {number} Column index or -1 if not found
   */
  function getColumnIndex(table, headerText) {
    // Get all header rows (Banner often uses 2-row headers)
    const headerRows = table.querySelectorAll('tr');
    const headerTextUpper = headerText.toUpperCase();
    
    // First, try to find in the first header row
    let firstHeaderRow = null;
    for (const row of headerRows) {
      if (row.querySelector('th')) {
        firstHeaderRow = row;
        break;
      }
    }
    
    if (firstHeaderRow) {
      const headers = firstHeaderRow.querySelectorAll('th');
      for (let i = 0; i < headers.length; i++) {
        if (headers[i].textContent.trim().toUpperCase().includes(headerTextUpper)) {
          return i;
        }
      }
    }
    
    // If not found, check all header rows (for multi-row headers)
    for (const row of headerRows) {
      const headers = row.querySelectorAll('th');
      if (headers.length === 0) break; // Stop if we hit a data row
      
      for (let i = 0; i < headers.length; i++) {
        const headerText = headers[i].textContent.trim().toUpperCase();
        if (headerText.includes(headerTextUpper)) {
          return i;
        }
      }
    }
    
    return -1;
  }

  /**
   * Parses a table row to extract course data
   * @param {HTMLElement} row - Table row element
   * @param {HTMLElement} table - Table element (for column mapping)
   * @param {Object} currentCourseInfo - Course info from previous rows (for continuation rows)
   * @returns {Object|null} Course data object or null if invalid
   */
  function parseTableRow(row, table, currentCourseInfo = {}) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 3) return null; // Not enough data
    
    // Based on the two-row header structure:
    // Row 1: CRN | Subj | Crse | Sec | Status | Cred | Title | (empty)
    // Row 2: (empty) | (empty) | (empty) | (empty) | (empty) | (empty) | (empty) | Start | End | Type | Days | Time | Room | Instructor
    // So the columns are: 0=CRN, 1=Subj, 2=Crse, 3=Sec, 4=Status, 5=Cred, 6=Title, 7=Start, 8=End, 9=Type, 10=Days, 11=Time, 12=Room, 13=Instructor
    
    // Try to get column indices first (in case structure varies)
    const subjIdx = getColumnIndex(table, 'Subj');
    const crseIdx = getColumnIndex(table, 'Crse');
    const secIdx = getColumnIndex(table, 'Sec');
    const titleIdx = getColumnIndex(table, 'Title');
    const typeIdx = getColumnIndex(table, 'Type');
    const daysIdx = getColumnIndex(table, 'Days');
    const timeIdx = getColumnIndex(table, 'Time');
    const startIdx = getColumnIndex(table, 'Start');
    const endIdx = getColumnIndex(table, 'End');
    const roomIdx = getColumnIndex(table, 'Room');
    
    // Extract data with fallback to known column positions
    const getCellText = (idx, fallbackIdx) => {
      if (idx >= 0 && idx < cells.length) {
        return cells[idx].textContent.trim();
      }
      if (fallbackIdx >= 0 && fallbackIdx < cells.length) {
        return cells[fallbackIdx].textContent.trim();
      }
      return '';
    };
    
    // Debug: Log all cell contents for debugging (will be filtered by caller)
    const allCellTexts = Array.from(cells).map((cell, idx) => `[${idx}]: "${cell.textContent.trim()}"`);
    
    // Try multiple possible column positions for Type, Start, End, Time, Days
    // The table might have different structures, so we'll search for these key fields
    let type = '';
    let start = '';
    let end = '';
    let time = '';
    let days = '';
    
    // Search for Type column - it's critical for identifying valid rows
    // Try pattern matching first (more reliable)
    for (let i = 0; i < cells.length; i++) {
      const cellText = cells[i].textContent.trim().toUpperCase();
      if (cellText === 'LECTURE' || cellText === 'LAB' || cellText === 'EXAM') {
        type = cells[i].textContent.trim();
        break;
      }
    }
    
    // If Type not found by pattern, try using column index
    if (!type) {
      type = getCellText(typeIdx, 9);
    }
    
    // Search for Start date (format: DD-MON-YYYY, e.g., 06-MAY-2024)
    for (let i = 0; i < cells.length; i++) {
      const cellText = cells[i].textContent.trim();
      // Match date pattern: 2 digits, hyphen, 3 letters, hyphen, 4 digits
      if (cellText.match(/^\d{1,2}-[A-Z]{3}-\d{4}$/i)) {
        start = cellText;
        // End date is usually in the next column
        if (i + 1 < cells.length) {
          const endText = cells[i + 1].textContent.trim();
          if (endText.match(/^\d{1,2}-[A-Z]{3}-\d{4}$/i)) {
            end = endText;
          }
        }
        break;
      }
    }
    
    // If Start not found by pattern, try using column index
    if (!start) {
      start = getCellText(startIdx, 7);
      end = getCellText(endIdx, 8);
    }
    
    // Search for Time (format: HHHH-HHHH, e.g., 1230-1420 or 830-1025)
    for (let i = 0; i < cells.length; i++) {
      const cellText = cells[i].textContent.trim();
      // Match time pattern: 3-4 digits, hyphen, 3-4 digits
      if (cellText.match(/^\d{3,4}-\d{3,4}$/)) {
        time = cellText;
        break;
      }
    }
    
    // If Time not found by pattern, try using column index
    if (!time) {
      time = getCellText(timeIdx, 11);
    }
    
    // Search for Days (format with M, T, W, R, F, S, U and hyphens, e.g., -T-R---)
    for (let i = 0; i < cells.length; i++) {
      const cellText = cells[i].textContent.trim();
      // Match days pattern: exactly 7 characters, each is M, T, W, R, F, S, U, or hyphen
      if (cellText.match(/^[-MTWRFSUmtwfrsu]{7}$/)) {
        days = cellText;
        break;
      }
    }
    
    // If Days not found by pattern, try using column index
    if (!days) {
      days = getCellText(daysIdx, 10);
    }
    
    // Get other fields using column indices or known positions
    const subj = getCellText(subjIdx, 1);
    const crse = getCellText(crseIdx, 2);
    const sec = getCellText(secIdx, 3);
    const title = getCellText(titleIdx, 6);
    const room = getCellText(roomIdx, 12);
    
    // Use current course info if this row doesn't have course identification
    const finalSubj = subj || currentCourseInfo.subject || '';
    const finalCrse = crse || currentCourseInfo.course || '';
    const finalSec = sec || currentCourseInfo.section || '';
    const finalTitle = title || currentCourseInfo.title || '';
    
    // Validate required fields
    // Must have a type (Lecture, Lab, or Exam) to create an event
    if (!type || type.trim() === '') {
      return null;
    }
    
    // Must have at least start date or time to create a valid event
    if (!start && !time) {
      return null;
    }
    
    // Normalize type to handle variations
    const normalizedType = type.toUpperCase().trim();
    
    // Build a course identifier - use available info or generic placeholder
    const courseIdentifier = (finalSubj && finalCrse) ? `${finalSubj} ${finalCrse}`.trim() : 
                            (finalSubj ? finalSubj : 'Course');
    const sectionPart = finalSec ? ` ${finalSec}` : '';
    const courseCode = `${courseIdentifier}${sectionPart}`.trim();
    
    return {
      subject: finalSubj,
      course: finalCrse,
      section: finalSec,
      title: finalTitle || courseCode,
      type: normalizedType,
      days: days,
      time: time,
      start: start,
      end: end,
      room: room
    };
  }

  /**
   * Creates an ICS-formatted date-time string in PST timezone
   * @param {string} dateStr - Date in YYYYMMDD format
   * @param {string} timeStr - Time in HH:MM format
   * @returns {string} ICS date-time string (YYYYMMDDTHHMMSS)
   */
  function formatICSDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return '';
    
    const [hours, minutes] = timeStr.split(':');
    return `${dateStr}T${hours.padStart(2, '0')}${minutes.padStart(2, '0')}00`;
  }

  /**
   * Converts PST date-time to UTC for RRULE UNTIL clause
   * PST is UTC-8, PDT is UTC-7 (we'll use PST = UTC-8)
   * @param {string} dateStr - Date in YYYYMMDD format
   * @param {string} timeStr - Time in HH:MM format
   * @returns {string} UTC date-time string (YYYYMMDDTHHMMSSZ)
   */
  function formatICSDateTimeUTC(dateStr, timeStr) {
    if (!dateStr || !timeStr) return '';
    
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours, 10);
    const minute = parseInt(minutes, 10);
    
    // Parse date
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1; // JS months are 0-indexed
    const day = parseInt(dateStr.substring(6, 8), 10);
    
    // Create date in PST (UTC-8)
    const pstDate = new Date(Date.UTC(year, month, day, hour, minute, 0));
    // Add 8 hours to convert PST to UTC
    pstDate.setUTCHours(pstDate.getUTCHours() + 8);
    
    // Format as YYYYMMDDTHHMMSSZ
    const utcYear = pstDate.getUTCFullYear();
    const utcMonth = String(pstDate.getUTCMonth() + 1).padStart(2, '0');
    const utcDay = String(pstDate.getUTCDate()).padStart(2, '0');
    const utcHours = String(pstDate.getUTCHours()).padStart(2, '0');
    const utcMinutes = String(pstDate.getUTCMinutes()).padStart(2, '0');
    
    return `${utcYear}${utcMonth}${utcDay}T${utcHours}${utcMinutes}00Z`;
  }

  /**
   * Escapes special characters in ICS text fields
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  function escapeICSText(text) {
    if (!text) return '';
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }

  /**
   * Creates a VEVENT block for a course session
   * @param {Object} courseData - Parsed course data
   * @returns {string} ICS VEVENT block
   */
  function createEvent(courseData) {
    const { subject, course, section, title, type, days, time, start, end, room } = courseData;
    
    // Parse dates and times
    const startDate = parseBannerDate(start);
    const endDate = parseBannerDate(end);
    const timeData = parseBannerTime(time);
    
    if (!startDate || !timeData) {
      console.warn('Invalid date or time for course:', courseData);
      return '';
    }
    
    // Build course identifier - handle missing subject/course gracefully
    let courseCode = '';
    if (subject && course) {
      courseCode = `${subject} ${course}`.trim();
      if (section) {
        courseCode += ` ${section}`;
      }
    } else if (subject) {
      courseCode = subject;
      if (section) {
        courseCode += ` ${section}`;
      }
    } else if (course) {
      courseCode = course;
      if (section) {
        courseCode += ` ${section}`;
      }
    } else {
      // Fallback: use title or generic identifier
      courseCode = title || 'Course';
    }
    
    // Build summary (event title)
    let summary = courseCode;
    if (type === 'EXAM') {
      summary = `FINAL EXAM - ${summary}`;
    } else {
      summary = `${summary} ${type}`;
    }
    
    // Build description
    const description = title || courseCode;
    
    // Build location
    const location = room ? `Langara College, Room ${room}` : 'Langara College';
    
    // Format start and end date-times
    const dtStart = formatICSDateTime(startDate, timeData.start);
    const dtEnd = formatICSDateTime(startDate, timeData.end);
    
    let icsEvent = `BEGIN:VEVENT\r\n`;
    icsEvent += `DTSTART;TZID=America/Los_Angeles:${dtStart}\r\n`;
    icsEvent += `DTEND;TZID=America/Los_Angeles:${dtEnd}\r\n`;
    
    // Add recurrence rule for Lectures and Labs (not Exams)
    if (type !== 'EXAM') {
      const icsDays = parseBannerDays(days);
      if (icsDays.length > 0 && endDate) {
        // Format UNTIL date as UTC (convert from PST)
        const untilDate = formatICSDateTimeUTC(endDate, '23:59');
        icsEvent += `RRULE:FREQ=WEEKLY;BYDAY=${icsDays.join(',')};UNTIL=${untilDate}\r\n`;
      }
    } else {
      // For exams, if end date is different, update DTEND
      if (endDate && endDate !== startDate) {
        const examEnd = formatICSDateTime(endDate, timeData.end);
        icsEvent = icsEvent.replace(`DTEND;TZID=America/Los_Angeles:${dtEnd}`, `DTEND;TZID=America/Los_Angeles:${examEnd}`);
      }
    }
    
    icsEvent += `SUMMARY:${escapeICSText(summary)}\r\n`;
    icsEvent += `DESCRIPTION:${escapeICSText(description)}\r\n`;
    icsEvent += `LOCATION:${escapeICSText(location)}\r\n`;
    icsEvent += `END:VEVENT\r\n`;
    
    return icsEvent;
  }

  /**
   * Generates complete ICS file content from course events
   * @param {Array<Object>} courses - Array of parsed course data
   * @returns {string} Complete ICS file content
   */
  function generateICS(courses) {
    let ics = `BEGIN:VCALENDAR\r\n`;
    ics += `VERSION:2.0\r\n`;
    ics += `PRODID:-//Langara Swing Schedule Exporter//EN\r\n`;
    ics += `CALSCALE:GREGORIAN\r\n`;
    ics += `X-WR-TIMEZONE:America/Los_Angeles\r\n`;
    
    // Generate events
    for (const course of courses) {
      const event = createEvent(course);
      if (event) {
        ics += event;
      }
    }
    
    ics += `END:VCALENDAR\r\n`;
    return ics;
  }

  /**
   * Triggers download of ICS file
   * @param {string} icsContent - ICS file content
   * @param {string} filename - Filename for download
   */
  function downloadICS(icsContent, filename = 'langara-schedule.ics') {
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  }

  /**
   * Scrapes all course data from the table
   * @returns {Array<Object>} Array of parsed course data
   */
  function scrapeCourseData() {
    const table = findDataTable();
    if (!table) {
      throw new Error('Could not find course schedule table on this page.');
    }
    
    const rows = table.querySelectorAll('tr');
    const courses = [];
    let skippedRows = 0;
    let invalidRows = 0;
    let headerRowCount = 0;
    
    // Count header rows (Banner uses 2-row headers)
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].querySelector('th')) {
        headerRowCount++;
      } else {
        break; // Stop at first data row
      }
    }
    
    // Get headers from all header rows for debugging
    const allHeaders = [];
    for (let i = 0; i < headerRowCount && i < rows.length; i++) {
      const headerRow = rows[i];
      const headers = Array.from(headerRow.querySelectorAll('th')).map(th => th.textContent.trim());
      allHeaders.push(headers);
    }
    console.log(`Found ${headerRowCount} header row(s):`, allHeaders);
    
    // Track current course info for rows that might not have all fields
    let currentCourseInfo = {
      subject: '',
      course: '',
      section: '',
      title: ''
    };
    
    // Skip header row(s) and iterate through data rows
    for (let i = headerRowCount; i < rows.length; i++) {
      const row = rows[i];
      const cells = row.querySelectorAll('td');
      
      // Skip rows with no cells or very few cells (likely empty/spacer rows)
      if (cells.length < 3) {
        skippedRows++;
        continue;
      }
      
      // Update current course info if this row has course identification fields
      // (Some rows might only have schedule info like Type, Days, Time, etc.)
      const subjText = cells.length > 1 ? cells[1].textContent.trim() : '';
      const crseText = cells.length > 2 ? cells[2].textContent.trim() : '';
      const secText = cells.length > 3 ? cells[3].textContent.trim() : '';
      const titleText = cells.length > 6 ? cells[6].textContent.trim() : '';
      
      if (subjText && crseText) {
        // This row has course identification, update our tracking
        currentCourseInfo = {
          subject: subjText,
          course: crseText,
          section: secText,
          title: titleText
        };
      }
      
      const courseData = parseTableRow(row, table, currentCourseInfo);
      if (courseData) {
        courses.push(courseData);
        // Update current course info from successfully parsed data
        if (courseData.subject && courseData.course) {
          currentCourseInfo = {
            subject: courseData.subject,
            course: courseData.course,
            section: courseData.section,
            title: courseData.title
          };
        }
      } else {
        invalidRows++;
        // Log first 5 invalid rows for debugging with detailed info
        if (invalidRows <= 5) {
          const cellTexts = Array.from(cells).map((cell, idx) => `[${idx}]="${cell.textContent.trim()}"`);
          console.log(`Invalid row ${invalidRows}:`, cellTexts.join(' | '));
          console.log(`  Cell count: ${cells.length}`);
        }
      }
    }
    
    console.log(`Parsed ${courses.length} courses, skipped ${skippedRows} header/empty rows, ${invalidRows} invalid rows`);
    
    if (courses.length === 0) {
      // Provide more detailed error message
      const errorMsg = `No course data found in the table. Found ${rows.length} total rows, ${headerRowCount} header rows, ${skippedRows} empty rows, ${invalidRows} invalid data rows. ` +
        `Please ensure you are on the "By Course View" page with registered courses visible.`;
      throw new Error(errorMsg);
    }
    
    return courses;
  }

  /**
   * Main function to generate and download ICS file
   */
  function generateAndDownload() {
    try {
      const button = document.getElementById('langara-ics-download-btn');
      if (button) {
        button.disabled = true;
        button.textContent = 'Generating...';
      }
      
      // Remove any existing messages
      const existingMsg = document.querySelector('.langara-ics-error-message, .langara-ics-success-message');
      if (existingMsg) {
        existingMsg.remove();
      }
      
      const courses = scrapeCourseData();
      const icsContent = generateICS(courses);
      
      // Generate filename with current date
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `langara-schedule-${dateStr}.ics`;
      
      downloadICS(icsContent, filename);
      
      // Show success message
      showMessage(`Successfully exported ${courses.length} course session(s) to ${filename}`, 'success');
      
      if (button) {
        button.disabled = false;
        button.textContent = 'Download Schedule (.ics)';
      }
    } catch (error) {
      console.error('Error generating ICS:', error);
      showMessage(`Error: ${error.message}`, 'error');
      
      const button = document.getElementById('langara-ics-download-btn');
      if (button) {
        button.disabled = false;
        button.textContent = 'Download Schedule (.ics)';
      }
    }
  }

  /**
   * Shows a message to the user
   * @param {string} message - Message text
   * @param {string} type - 'success' | 'error' | 'warning'
   */
  function showMessage(message, type = 'error') {
    const className = `langara-ics-${type}-message`;
    const msgDiv = document.createElement('div');
    msgDiv.className = className;
    msgDiv.textContent = message;
    
    const button = document.getElementById('langara-ics-download-btn');
    if (button && button.parentNode) {
      button.parentNode.insertBefore(msgDiv, button.nextSibling);
    } else {
      // Fallback: insert at top of pagebodydiv
      const pageBody = document.querySelector('.pagebodydiv') || document.body;
      pageBody.insertBefore(msgDiv, pageBody.firstChild);
    }
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (msgDiv.parentNode) {
        msgDiv.remove();
      }
    }, 10000);
  }

  /**
   * Injects the download button into the page
   */
  function injectDownloadButton() {
    // Check if button already exists
    if (document.getElementById('langara-ics-download-btn')) {
      return;
    }
    
    const button = document.createElement('button');
    button.id = 'langara-ics-download-btn';
    button.className = 'langara-ics-download-btn';
    button.textContent = 'Download Schedule (.ics)';
    button.addEventListener('click', generateAndDownload);
    
    // Try to find the "Registered Courses" header or table
    const table = findDataTable();
    if (table) {
      // Insert before the table
      table.parentNode.insertBefore(button, table);
    } else {
      // Fallback: insert at top of pagebodydiv
      const pageBody = document.querySelector('.pagebodydiv') || document.body;
      pageBody.insertBefore(button, pageBody.firstChild);
    }
  }

  /**
   * Shows warning banner if user is on "By Week View"
   */
  function showViewWarning() {
    const pageType = detectPageType();
    
    if (pageType === 'week') {
      // Check if warning already exists
      if (document.getElementById('langara-ics-warning-banner')) {
        return;
      }
      
      const banner = document.createElement('div');
      banner.id = 'langara-ics-warning-banner';
      banner.className = 'langara-ics-warning-banner';
      banner.textContent = 'For best results, please switch to the "By Course View" tab to download your full semester schedule.';
      
      const button = document.getElementById('langara-ics-download-btn');
      if (button && button.parentNode) {
        button.parentNode.insertBefore(banner, button);
      } else {
        // Fallback: insert at top of pagebodydiv
        const pageBody = document.querySelector('.pagebodydiv') || document.body;
        pageBody.insertBefore(banner, pageBody.firstChild);
      }
    }
  }

  /**
   * Initialize the extension
   */
  function init() {
    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      injectDownloadButton();
      showViewWarning();
    }, 500);
  }

  // Start initialization
  init();
})();

