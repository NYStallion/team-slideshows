const fs = require('fs');
const fetch = require('node-fetch');

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

async function fetchSheetData(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;
  
  console.log(`Fetching data from: ${url}`);
  
  try {
    const response = await fetch(url);
    console.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status}`);
      return [];
    }
    
    const csvText = await response.text();
    console.log(`CSV text length: ${csvText.length}`);
    console.log(`First 200 characters: ${csvText.substring(0, 200)}`);
    
    // Check if response is an error page
    if (csvText.includes('<!DOCTYPE html>') || csvText.includes('<html')) {
      console.error('Received HTML instead of CSV - likely permission error');
      return [];
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
    
    return filteredLines;
  } catch (error) {
    console.error(`Error fetching ${sheetName}:`, error.message);
    return [];
  }
}

function parseTeamsData(teamsData) {
  const teams = [];
  
  for (let i = 0; i < teamsData.length; i++) {
    const row = teamsData[i];
    if (row[0] && row[0].startsWith('Team ')) {
      const teamNumber = row[0].replace('Team ', '');
      const birdName = row[1] || '';
      
      const team = {
        number: teamNumber,
        birdName: birdName,
        players: [],
        observers: []
      };
      
      // Parse next 6 rows for team members
      for (let j = i + 1; j < Math.min(i + 7, teamsData.length); j++) {
        const memberRow = teamsData[j];
        const role = memberRow[0] || '';
        const globalName = memberRow[1] || 'None';
        const twitchName = memberRow[2] || 'None';
        const status = memberRow[3] || '';
        
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
      }
      
      teams.push(team);
    }
  }
  
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
            width: 1920px;
            height: 1080px;
            margin: 0 auto;
        }
        
        .slide {
            display: none;
            position: absolute;
            width: 100%;
            height: 100%;
            background-size: cover;
            background-position: center;
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
            width: 80%;
            max-width: 600px;
        }
        
        .team-title {
            font-size: 36px;
            font-weight: bold;
            margin-bottom: 15px;
        }
        
        .bird-name {
            font-size: 28px;
            margin-bottom: 20px;
            color: #FFD700;
        }
        
        .players-section {
            margin-bottom: 15px;
        }
        
        .player {
            font-size: 20px;
            margin: 8px 0;
        }
        
        .player.eliminated {
            color: #FF6B6B;
            text-decoration: line-through;
        }
        
        .player.alive {
            color: #4ECDC4;
        }
        
        .observers-section {
            margin-top: 15px;
        }
        
        .observer {
            font-size: 18px;
            margin: 6px 0;
            color: #FFA500;
        }
        
        .slideshow-header {
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 16px;
            font-weight: bold;
        }
        
        .last-updated {
            position: absolute;
            bottom: 20px;
            left: 20px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 5px 10px;
            border-radius: 3px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="slideshow-header">${slideshowTitle} (${teams.length} teams)</div>
    <div class="last-updated">Last updated: ${new Date().toLocaleString()}</div>
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

        function showSlide(index) {
            slides.forEach(slide => slide.classList.remove('active'));
            if (slides[index]) {
                slides[index].classList.add('active');
            }
        }

        function nextSlide() {
            currentSlide = (currentSlide + 1) % totalSlides;
            showSlide(currentSlide);
        }

        // Auto-advance every 5 seconds
        if (totalSlides > 1) {
            setInterval(nextSlide, 5000);
        }
        
        // Click to advance manually
        document.addEventListener('click', nextSlide);
    </script>
</body>
</html>`;
}

async function main() {
  console.log('Fetching team data...');
  
  // Fetch data from Google Sheets
  console.log('Attempting to fetch Teams data...');
  const teamsData = await fetchSheetData(SHEETS.TEAMS);
  
  console.log('Raw teams data length:', teamsData.length);
  console.log('First few rows:', teamsData.slice(0, 5));
  
  if (teamsData.length === 0) {
    console.log('No teams data found - creating empty HTML files as placeholders');
    
    // Create placeholder files
    const placeholderHtml = generatePlaceholderHTML();
    fs.writeFileSync('alive-teams.html', placeholderHtml('Alive Teams - No Data Yet'));
    fs.writeFileSync('eliminated-teams.html', placeholderHtml('Eliminated Teams - No Data Yet'));
    console.log('Created placeholder HTML files');
    return;
  }
  
  // Parse teams
  const allTeams = parseTeamsData(teamsData);
  console.log(`Found ${allTeams.length} teams`);
  
  // Separate alive and eliminated teams
  const aliveTeams = [];
  const eliminatedTeams = [];
  
  allTeams.forEach(team => {
    const hasAlivePlayer = team.players.some(player => 
      player.globalName !== 'None' && !player.eliminated
    );
    
    if (hasAlivePlayer) {
      aliveTeams.push(team);
    } else {
      eliminatedTeams.push(team);
    }
  });
  
  console.log(`Alive teams: ${aliveTeams.length}, Eliminated teams: ${eliminatedTeams.length}`);
  
  // Generate HTML files
  if (aliveTeams.length > 0) {
    const aliveHtml = generateSlideshowHTML(aliveTeams, 'Alive Teams');
    fs.writeFileSync('alive-teams.html', aliveHtml);
    console.log('Generated alive-teams.html');
  }
  
  if (eliminatedTeams.length > 0) {
    const eliminatedHtml = generateSlideshowHTML(eliminatedTeams, 'Eliminated Teams');
    fs.writeFileSync('eliminated-teams.html', eliminatedHtml);
    console.log('Generated eliminated-teams.html');
  }
  
  console.log('Slideshow generation complete!');
}

main().catch(console.error);
