const fs = require('fs');
const https = require('https');

// Configuration
const SPREADSHEET_ID = '1xaj-khNOUoX8c8jFsutmW8oQtlJp5LCVCpYr7tIoZio';
const SHEETS = {
  PLAYERS: 'Players',
  OBSERVERS: 'Observers', 
  TEAMS: 'Teams',
  BUSTED: 'Busted',
  BIRDS: 'Birds'
};

// Background image URLs (GitHub repository URLs)
const BACKGROUNDS = {
  alive: './backgrounds/alive.png',
  partial: './backgrounds/partial.png',
  eliminated: './backgrounds/eliminated.png'
};

function fetchSheetData(sheetName) {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;
    
    console.log(`Fetching data from: ${url}`);
    
    https.get(url, (response) => {
      console.log(`Response status: ${response.statusCode}`);
      
      if (response.statusCode !== 200) {
        console.error(`HTTP error! status: ${response.statusCode}`);
        resolve([]);
        return;
      }
      
      let csvText = '';
      
      response.on('data', (chunk) => {
        csvText += chunk;
      });
      
      response.on('end', () => {
        try {
          console.log(`CSV text length: ${csvText.length}`);
          console.log(`First 200 characters: ${csvText.substring(0, 200)}`);
          
          // Check if response is an error page
          if (csvText.includes('<!DOCTYPE html>') || csvText.includes('<html')) {
            console.error('Received HTML instead of CSV - likely permission error');
            resolve([]);
            return;
          }
          
          // Parse CSV manually (simple approach)
          const lines = csvText.split('\n').map(line => {
            // Simple CSV parsing - handles quoted fields
            const result = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                result.push(current.trim().replace(/^"|"$/g, ''));
                current = '';
              } else {
                current += char;
              }
            }
            result.push(current.trim().replace(/^"|"$/g, ''));
            return result;
          });
          
          const filteredLines = lines.filter(line => line.some(cell => cell.length > 0));
          console.log(`Parsed ${filteredLines.length} rows from ${sheetName}`);
          
          resolve(filteredLines);
        } catch (error) {
          console.error(`Error parsing CSV from ${sheetName}:`, error.message);
          resolve([]);
        }
      });
      
    }).on('error', (error) => {
      console.error(`Error fetching ${sheetName}:`, error.message);
      resolve([]);
    });
  });
}

function parseTeamsData(teamsData) {
  const teams = [];
  
  console.log('Parsing teams data with multi-row format...');
  
  for (let i = 0; i < teamsData.length; i++) {
    const row = teamsData[i];
    
    // Look for team header rows (e.g., "Team 1")
    if (row[0] && row[0].toString().startsWith('Team ')) {
      console.log(`Found team header: ${row[0]}`);
      
      const teamNumber = row[0].replace('Team ', '');
      const birdName = row[1] || ''; // Bird name is in column B of team header
      
      const team = {
        number: teamNumber,
        birdName: birdName,
        players: [],
        observers: []
      };
      
      // Parse the next several rows for team members
      // Skip the header row (Global Name, Twitch Name)
      let j = i + 1;
      if (j < teamsData.length && teamsData[j][1] === 'Global Name') {
        j++; // Skip header row
      }
      
      // Parse member rows until we hit another team or run out of data
      while (j < teamsData.length) {
        const memberRow = teamsData[j];
        const role = memberRow[0] ? memberRow[0].toString().trim() : '';
        
        // Stop if we hit another team or empty row
        if (role.startsWith('Team ') || (!role && !memberRow[1] && !memberRow[2])) {
          break;
        }
        
        const globalName = memberRow[1] || 'None';
        const twitchName = memberRow[2] || 'None';
        const status = memberRow[3] || '';
        
        console.log(`  ${role}: ${globalName} (${twitchName}) - Status: ${status}`);
        
        if (role === 'Player 1' || role === 'Player 2') {
          team.players.push({
            role,
            globalName,
            twitchName,
            eliminated: status === 'Eliminated'
          });
        } else if (role === 'Observer' || role === 'Observer 2') {
          team.observers.push({
            role,
            globalName,
            twitchName
          });
        }
        
        j++;
      }
      
      console.log(`Team ${teamNumber} parsed: ${team.players.length} players, ${team.observers.length} observers`);
      teams.push(team);
      
      // Continue from where we left off
      i = j - 1; // -1 because the for loop will increment
    }
  }
  
  console.log(`Successfully parsed ${teams.length} teams`);
  return teams;
}

function getTeamStatus(team) {
  let alivePlayers = 0;
  let eliminatedPlayers = 0;
  
  team.players.forEach(player => {
    if (player.globalName !== 'None') {
      if (player.eliminated) {
        eliminatedPlayers++;
      } else {
        alivePlayers++;
      }
    }
  });
  
  if (eliminatedPlayers === 0) {
    return 'alive';
  } else if (alivePlayers > 0 && eliminatedPlayers > 0) {
    return 'partial';
  } else {
    return 'eliminated';
  }
}

function generateSlideshowHTML(teams, slideshowTitle) {
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${slideshowTitle}</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #000;
            font-family: Arial, sans-serif;
            overflow: hidden;
        }
        
        .slideshow-container {
            position: relative;
            width: 480px;
            height: 533px;
            margin: 0 auto;
            transform: scale(2.0);
            transform-origin: center;
            overflow: hidden;
        }
        
        .slide {
            display: none;
            position: absolute;
            width: 100%;
            height: 100%;
            background-size: cover;
            background-position: center top;
            background-repeat: no-repeat;
        }
        
        .slide.active {
            display: block;
        }
        
        .team-content {
            position: absolute;
            top: 60%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            color: white;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            width: 90%;
            max-width: 480px;
            padding: 10px;
        }
        
        .team-title {
            font-size: 30px;
            font-weight: bold;
            margin-bottom: 8px;
        }
        
        .bird-name {
            font-size: 30px;
            margin-bottom: 12px;
            color: #FFD700;
        }
        
        .players-section {
            margin-bottom: 10px;
        }
        
        .player {
            font-size: clamp(16px, 4vw, 24px);
            margin: 5px 0;
            line-height: 1.2;
            word-wrap: break-word;
            overflow-wrap: break-word;
            hyphens: auto;
        }
        
        .player.eliminated {
            color: #FF6B6B;
            text-decoration: line-through;
        }
        
        .player.alive {
            color: #4ECDC4;
        }
        
        .observers-section {
            margin-top: 10px;
        }
        
        .observer {
            font-size: clamp(16px, 4vw, 24px);
            margin: 4px 0;
            color: #FFA500;
            line-height: 1.2;
            word-wrap: break-word;
            overflow-wrap: break-word;
            hyphens: auto;
        }
        
        .slideshow-header {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 5px 10px;
            border-radius: 3px;
            font-size: 12px;
            font-weight: bold;
        }
        
        .last-updated {
            position: absolute;
            bottom: 10px;
            left: 10px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 3px 6px;
            border-radius: 2px;
            font-size: 10px;
        }
    </style>
</head>
<body>
    <div class="slideshow-header">${slideshowTitle} (${teams.length} teams)</div>
    <div class="last-updated">Last updated: ${new Date().toLocaleString()} | Auto-refresh enabled</div>
    <div class="slideshow-container">
        ${teams.map((team, index) => {
          const status = getTeamStatus(team);
          const backgroundUrl = BACKGROUNDS[status];
          
          return `
        <div class="slide ${index === 0 ? 'active' : ''}" style="background-image: url('${backgroundUrl}')">
            <div class="team-content">
                <div class="team-title">Team ${team.number}</div>
                ${team.birdName ? `<div class="bird-name">${team.birdName}</div>` : ''}
                
                <div class="players-section">
                    ${team.players.map(player => {
                      const playerClass = player.eliminated ? 'eliminated' : 'alive';
                      return `<div class="player ${playerClass}">
                        ${player.role}: ${player.globalName} (${player.twitchName})
                      </div>`;
                    }).join('')}
                </div>
                
                <div class="observers-section">
                    ${team.observers.filter(obs => obs.globalName !== 'None').map(observer => 
                      `<div class="observer">
                        ${observer.role}: ${observer.globalName} (${observer.twitchName})
                      </div>`
                    ).join('')}
                </div>
            </div>
        </div>`;
        }).join('')}
    </div>

    <script>
        let currentSlide = 0;
        const slides = document.querySelectorAll('.slide');
        const totalSlides = slides.length;
        let updatePending = false;
        let slideCount = 0; // Track total slides shown

        function showSlide(index) {
            slides.forEach(slide => slide.classList.remove('active'));
            if (slides[index]) {
                slides[index].classList.add('active');
            }
        }

        function nextSlide() {
            currentSlide = (currentSlide + 1) % totalSlides;
            slideCount++;
            showSlide(currentSlide);
            
            // Check if we've completed a full cycle and have a pending update
            if (currentSlide === 0 && updatePending) {
                console.log('Full slideshow cycle completed, refreshing for updates...');
                window.location.reload();
            }
        }

        // Calculate timing: 60 seconds divided by number of teams
        const slideInterval = totalSlides > 0 ? Math.max(1000, (60 * 1000) / totalSlides) : 5000;
        console.log(`Slideshow timing: ${slideInterval}ms per slide (${totalSlides} teams, ${(slideInterval/1000).toFixed(1)}s each)`);

        // Auto-advance based on calculated timing
        if (totalSlides > 1) {
            setInterval(nextSlide, slideInterval);
        }
        
        // Click to advance manually
        document.addEventListener('click', nextSlide);
        
        // Check for updates every 30 seconds
        setInterval(checkForUpdates, 30000);
        
        function checkForUpdates() {
            // Check if file has been modified
            fetch(window.location.href + '?t=' + Date.now(), {
                method: 'HEAD',
                cache: 'no-cache'
            }).then(response => {
                const lastModified = response.headers.get('Last-Modified');
                if (lastModified && lastModified !== document.lastModified) {
                    console.log('Update detected, will refresh after current slideshow cycle completes');
                    updatePending = true;
                    
                    // If we're currently on the last slide, refresh immediately
                    if (currentSlide === totalSlides - 1) {
                        console.log('On last slide, refreshing after next transition...');
                    }
                }
            }).catch(error => {
                console.log('Update check failed, will retry');
            });
        }
    </script>
</body>
</html>`;
}

async function main() {
  console.log('=== STARTING SLIDESHOW GENERATION ===');
  console.log('Fetching team data...');
  
  // Fetch data from Google Sheets
  console.log('Attempting to fetch Teams data...');
  const teamsData = await fetchSheetData(SHEETS.TEAMS);
  
  console.log('Raw teams data length:', teamsData.length);
  console.log('First few rows:', JSON.stringify(teamsData.slice(0, 10), null, 2));
  
  if (teamsData.length === 0) {
    console.log('No teams data found - creating empty HTML files as placeholders');
    
    // Create placeholder files
    const aliveHtml = generatePlaceholderHTML('Alive Teams - No Data Yet');
    const eliminatedHtml = generatePlaceholderHTML('Eliminated Teams - No Data Yet');
    
    fs.writeFileSync('alive-teams.html', aliveHtml);
    fs.writeFileSync('eliminated-teams.html', eliminatedHtml);
    console.log('Created placeholder HTML files');
    return;
  }
  
  // Parse teams
  console.log('=== PARSING TEAMS DATA ===');
  const allTeams = parseTeamsData(teamsData);
  console.log(`Found ${allTeams.length} teams`);
  
  if (allTeams.length === 0) {
    console.log('No teams parsed - creating placeholder files');
    const aliveHtml = generatePlaceholderHTML('Alive Teams - No Teams Found');
    const eliminatedHtml = generatePlaceholderHTML('Eliminated Teams - No Teams Found');
    
    fs.writeFileSync('alive-teams.html', aliveHtml);
    fs.writeFileSync('eliminated-teams.html', eliminatedHtml);
    console.log('Created placeholder HTML files due to no teams');
    return;
  }
  
  // Log each team for debugging
  allTeams.forEach((team, index) => {
    console.log(`Team ${index + 1} (${team.number}): ${team.players.length} players, ${team.observers.length} observers`);
    console.log(`  Bird: ${team.birdName}`);
    team.players.forEach(player => {
      console.log(`    ${player.role}: ${player.globalName} (eliminated: ${player.eliminated})`);
    });
  });
  
  // Separate alive and eliminated teams
  const aliveTeams = [];
  const eliminatedTeams = [];
  
  allTeams.forEach(team => {
    const hasAlivePlayer = team.players.some(player => 
      player.globalName !== 'None' && !player.eliminated
    );
    
    console.log(`Team ${team.number}: hasAlivePlayer = ${hasAlivePlayer}`);
    
    if (hasAlivePlayer) {
      aliveTeams.push(team);
    } else {
      eliminatedTeams.push(team);
    }
  });
  
  console.log(`=== TEAM CLASSIFICATION ===`);
  console.log(`Alive teams: ${aliveTeams.length}, Eliminated teams: ${eliminatedTeams.length}`);
  
  // Always generate both files (even if empty)
  console.log('=== GENERATING HTML FILES ===');
  
  if (aliveTeams.length > 0) {
    const aliveHtml = generateSlideshowHTML(aliveTeams, 'Alive Teams');
    fs.writeFileSync('alive-teams.html', aliveHtml);
    console.log('Generated alive-teams.html with', aliveTeams.length, 'teams');
  } else {
    const aliveHtml = generatePlaceholderHTML('Alive Teams - No Alive Teams');
    fs.writeFileSync('alive-teams.html', aliveHtml);
    console.log('Generated alive-teams.html placeholder (no alive teams)');
  }
  
  if (eliminatedTeams.length > 0) {
    const eliminatedHtml = generateSlideshowHTML(eliminatedTeams, 'Eliminated Teams');
    fs.writeFileSync('eliminated-teams.html', eliminatedHtml);
    console.log('Generated eliminated-teams.html with', eliminatedTeams.length, 'teams');
  } else {
    const eliminatedHtml = generatePlaceholderHTML('Eliminated Teams - No Eliminated Teams');
    fs.writeFileSync('eliminated-teams.html', eliminatedHtml);
    console.log('Generated eliminated-teams.html placeholder (no eliminated teams)');
  }
  
  console.log('=== SLIDESHOW GENERATION COMPLETE ===');
  
  // Verify files were created
  try {
    const aliveStats = fs.statSync('alive-teams.html');
    const eliminatedStats = fs.statSync('eliminated-teams.html');
    console.log(`alive-teams.html: ${aliveStats.size} bytes`);
    console.log(`eliminated-teams.html: ${eliminatedStats.size} bytes`);
  } catch (error) {
    console.error('Error checking file stats:', error.message);
  }
}

main().catch(error => {
  console.error('=== ERROR IN MAIN FUNCTION ===');
  console.error(error);
  process.exit(1);
});
