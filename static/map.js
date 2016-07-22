
let pad = number => number <= 99 ? ("0"+number).slice(-2) : number;

var $loginStatus = $(".login-status");
var $lastRequestLabel = $(".last-request");
var $selectExclude = $("#exclude-pokemon");
var excludedPokemon = [];
try {
    excludedPokemon = JSON.parse(localStorage.excludedPokemon);
    console.log(excludedPokemon);
} catch (e) {}

var d = "displayPokemons" in localStorage ? localStorage.displayPokemons : 'true';
document.getElementById('pokemon-checkbox').checked = (d === 'true');
d = "displayGyms" in localStorage ? localStorage.displayGyms : 'true';
document.getElementById('gyms-checkbox').checked = (d === 'true');

$.getJSON("static/locales/pokemon.en.json").done(function(data) {
    var pokeList = []
    
    $.each(data, function(key, value) {
        pokeList.push( { id: key, text: value } );
    });
    
    $selectExclude.select2({
        placeholder: "Type to exclude Pokemon",
        data: pokeList,
    });
    $selectExclude.val(excludedPokemon).trigger("change");
});


$selectExclude.on("change", function (e) { 
    excludedPokemon = $selectExclude.val().map(Number);
    localStorage.excludedPokemon = JSON.stringify(excludedPokemon);
    clearStaleMarkers();
});


var map;
function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: {lat: center_lat, lng: center_lng},
        zoom: 15,
        mapTypeControl: false,
        streetViewControl: false
    });
    
    marker = new google.maps.Marker({
        position: {lat: center_lat, lng: center_lng},
        map: map,
        animation: google.maps.Animation.DROP
    });
    displayCoverage();

};


function pokemonLabel(name, disappear_time, id, disappear_time, latitude, longitude) {
    disappear_date = new Date(disappear_time)
    
    var label = `
        <div>
            <b>${name}</b>
            <span> - </span>
            <small>
                <a href='http://www.pokemon.com/us/pokedex/${id}' target='_blank' title='View in Pokedex'>#${id}</a>
            </small>
        </div>
        <div>
            Disappears at ${pad(disappear_date.getHours())}:${pad(disappear_date.getMinutes())}:${pad(disappear_date.getSeconds())} 
            <span class='label-countdown' disappears-at='${disappear_time}'>(00m00s)</span></div>
        <div>
            <a href='https://www.google.com/maps/dir/Current+Location/${latitude},${longitude}' 
                    target='_blank' title='View in Maps'>Get Directions</a>
        </div>`;
    return label;
};

function gymLabel(team_name, team_id, gym_points) {
    var gym_color = [ "0, 0, 0, .4", "74, 138, 202, .6", "240, 68, 58, .6", "254, 217, 40, .6" ];
    var str;
    if (team_name == 0) {
        str = `<div><center>
            <div>
                <b style='color:rgba(${gym_color[team_id]})'>${team_name}</b><br>
            </div>
            </center></div>`;
    } else {
        str = `
            <div><center>
            <div style='padding-bottom: 2px'>Gym owned by:</div>
            <div>
                <b style='color:rgba(${gym_color[team_id]})'>Team ${team_name}</b><br>
                <img height='70px' style='padding: 5px;' src='static/forts/${team_name}_large.png'> 
            </div>
            <div>Prestige: ${gym_points}</div>
            </center></div>`;
    }

    return str;
}


map_pokemons = {} // dict containing all pokemons on the map.
map_gyms = {}
var gym_types = [ "Uncontested", "Mystic", "Valor", "Instinct" ];

function setupPokemonMarker(item) {
    var myIcon = new google.maps.MarkerImage('static/icons/'+item.pokemon_id+'.png', null, null, null, new google.maps.Size(30,30));

    var marker = new google.maps.Marker({
        position: {lat: item.latitude, lng: item.longitude},
        map: map,
        icon: myIcon
    });
    
    marker.infoWindow = new google.maps.InfoWindow({
        content: pokemonLabel(item.pokemon_name, item.disappear_time, item.pokemon_id, item.disappear_time, item.latitude, item.longitude)
    });
    
    addListeners(marker);
    return marker;
};

function setupGymMarker(item) {
    var marker = new google.maps.Marker({
        position: {lat: item.latitude, lng: item.longitude},
        map: map,
        icon: 'static/forts/'+gym_types[item.team_id]+'.png'
    });
    
    marker.infoWindow = new google.maps.InfoWindow({
        content: gymLabel(gym_types[item.team_id], item.team_id, item.gym_points)
    });
    
    addListeners(marker);
    return marker;
};

function addListeners(marker){
    marker.addListener('click', function() {
        marker.infoWindow.open(map, marker);
        updateLabelDiffTime();
        marker.persist = true;
    });
    
    google.maps.event.addListener(marker.infoWindow,'closeclick',function(){
        marker.persist = null;
    });

    marker.addListener('mouseover', function() {
        marker.infoWindow.open(map, marker);
        updateLabelDiffTime();
    });
    
    marker.addListener('mouseout', function() {
        if (!marker.persist) {
            marker.infoWindow.close();
        }
    });
    return marker
};

function clearStaleMarkers(){
    $.each(map_pokemons, function(key, value) {
        
        if (map_pokemons[key]['disappear_time'] < new Date().getTime() ||
                excludedPokemon.indexOf(map_pokemons[key]['pokemon_id']) >= 0) {
            map_pokemons[key].marker.setMap(null);
            console.log("removing marker with key "+key);
            delete map_pokemons[key];
        }
    });
};

function updateMap() {
    $.ajax({
        url: "map-data",
        type: 'GET',
        data: {'pokemon': localStorage.displayPokemons,
               'pokestops': document.getElementById('pokestops-checkbox').checked,
               'pokestops-lured': document.getElementById('pokestops-lured-checkbox').checked,
               'gyms': localStorage.displayGyms},
        dataType: "json"
    }).done(function(result){
        statusLabels(result["server_status"]);
        
        $.each(result.pokemons, function(i, item){
            if (!document.getElementById('pokemon-checkbox').checked) {
                return false; // in case the checkbox was unchecked in the meantime.
            }

            if (!(item.encounter_id in map_pokemons) && 
                    excludedPokemon.indexOf(item.pokemon_id) < 0) {
                // add marker to map and item to dict
                if (item.marker) item.marker.setMap(null);
                item.marker = setupPokemonMarker(item);
                map_pokemons[item.encounter_id] = item;
            }
        });
        
        $.each(result.gyms, function(i, item){
            if (!document.getElementById('gyms-checkbox').checked) {
                return false; // in case the checkbox was unchecked in the meantime.
            }
            
            if (item.gym_id in map_gyms) {
                // if team has changed, create new marker (new icon)
                if (map_gyms[item.gym_id].team_id != item.team_id) {
                    map_gyms[item.gym_id].marker.setMap(null);
                    map_gyms[item.gym_id].marker = setupGymMarker(item);
                } else { // if it hasn't changed generate new label only (in case prestige has changed)
                    map_gyms[item.gym_id].marker.infoWindow = new google.maps.InfoWindow({
                        content: gymLabel(gym_types[item.team_id], item.team_id, item.gym_points)
                    });
                    
                }
            }
            else { // add marker to map and item to dict
                if (item.marker) item.marker.setMap(null);
                item.marker = setupGymMarker(item);
                map_gyms[item.gym_id] = item;
            }
            
        });
        clearStaleMarkers();
    });
};

window.setInterval(updateMap, 10000);
updateMap();

$('#gyms-checkbox').change(function() {
    localStorage.displayGyms = this.checked;
    if(this.checked) {
        updateMap();
    } else {
        $.each(map_gyms, function(key, value) {
            map_gyms[key].marker.setMap(null);
        });
        map_gyms = {}
    }
});

$('#pokemon-checkbox').change(function() {
    localStorage.displayPokemons = this.checked;
    if(this.checked) {
        updateMap();
    } else {
        $.each(map_pokemons, function(key, value) {
            map_pokemons[key].marker.setMap(null);
        });
        map_pokemons = {}
    }
});

    
var coverage;
function displayCoverage() {
    $.getJSON("cover", {format: "json"}).done(function(data) {    
        $.each(data, function(i, point) {
            var circle = new google.maps.Circle({
                strokeColor: '#FF0000',
                strokeOpacity: 0.6,
                strokeWeight: 1,
                fillColor: '#FF0000',
                fillOpacity: 0.08,
                clickable: false,
                map: map,
                center: point,
                radius: 100
            });
        });
    });
}

function statusLabels(status) {
    if (status['login_time'] == 0) {
        $loginStatus.html('Login failed');
        $loginStatus.removeClass('label-success');
        $loginStatus.addClass('label-warning');
    } else {
        $loginStatus.html('Logged in');
        $loginStatus.removeClass('label-warning');
        $loginStatus.addClass('label-success');
    }
    
    var difference = -status['last-successful-request'];
    var hours = Math.floor(difference / 3600);
    var minutes = Math.floor(difference % 3600 / 60);
    var seconds = Math.floor(difference % 3600 % 60);
    var milli = Math.floor((difference % 3600 % 60 - seconds)*100);
    
    if (difference > 31536000) return;
        
    timestring = "";
    if(hours > 0) timestring += hours + "h";
    if(minutes > 0) timestring += pad(minutes) + "m";
    timestring += pad(seconds) + "." + pad(milli) + "s";
    $lastRequestLabel.html("Last scan: "+timestring+ " ago");
    
    if (difference <= 2) {
        $lastRequestLabel.removeClass('label-danger');
        $lastRequestLabel.removeClass('label-warning');
        $lastRequestLabel.addClass('label-success');
    } if (difference > 2 && difference <= 10) {
        $lastRequestLabel.removeClass('label-danger');
        $lastRequestLabel.removeClass('label-success');
        $lastRequestLabel.addClass('label-warning');
    } if (difference > 10) {
        $lastRequestLabel.removeClass('label-warning');
        $lastRequestLabel.removeClass('label-success');
        $lastRequestLabel.addClass('label-danger');
    }

}

var updateLabelDiffTime = function() {
    $('.label-countdown').each(function (index, element) {
        var disappearsAt = new Date(parseInt(element.getAttribute("disappears-at")));
        var now = new Date();
        
        var difference = Math.abs(disappearsAt - now);
        var hours = Math.floor(difference / 36e5);
        var minutes = Math.floor((difference - (hours * 36e5)) / 6e4);
        var seconds = Math.floor((difference - (hours * 36e5) - (minutes * 6e4)) / 1e3);
        
        if(disappearsAt < now){
            timestring = "(expired)";
        } 
        else {
            timestring = "(";
            if(hours > 0)
                timestring = hours + "h";
            
            timestring += ("0" + minutes).slice(-2) + "m";
            timestring += ("0" + seconds).slice(-2) + "s";
            timestring += ")";
        }

        $(element).text(timestring)
    });
};

window.setInterval(updateLabelDiffTime, 1000);
