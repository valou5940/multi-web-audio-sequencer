//audio node variables
var context;
var convolver;
var compressor;
var masterGainNode;
var effectLevelNode;
var lowPassFilterNode;
var mediaRecorder;
var recordingDest;
var chunks = [];

var noteTime;
var startTime;
var lastDrawTime = -1;
var rhythmIndex = 0;
var timeoutId;
var testBuffer = null;
var isRecording = false;
var isPlaying = false;

var currentSequencerState = null;
var currentKit = null;
var wave = null;
var reverbImpulseResponse = null;
var sequencerPresetNames = [];

var tempo = 120;
var TEMPO_MAX = 200;
var TEMPO_MIN = 40;
var TEMPO_STEP = 1;
var MAXLENGTH = 64;
var COMPRESSOR_ACTIVATED = false;


if (window.hasOwnProperty('AudioContext') && !window.hasOwnProperty('webkitAudioContext')) {
  window.webkitAudioContext = AudioContext;
}

$(function () {
  init();
  addNewTrackEvent();
  addChangeSequenceLengthEvent();
  playPauseListener();
  RecordListener();
  lowPassFilterListener();
  reverbListener();
  createLowPassFilterSliders();
  initializeTempo();
  changeTempoListener();
  search = initSearch();
});

function createLowPassFilterSliders() {
  $("#freq-slider").slider({
    value: 1,
    min: 0,
    max: 1,
    step: 0.01,
    disabled: true,
    slide: changeFrequency
  });
  $("#quality-slider").slider({
    value: 0,
    min: 0,
    max: 1,
    step: 0.01,
    disabled: true,
    slide: changeQuality
  });
}

function lowPassFilterListener() {
  $('#lpf').click(function () {
    $(this).toggleClass("active");
    $(this).blur();
    if ($(this).hasClass("btn-default")) {
      $(this).removeClass("btn-default");
      $(this).addClass("btn-warning");
      lowPassFilterNode.active = true;
      $("#freq-slider,#quality-slider").slider("option", "disabled", false);
    } else {
      $(this).addClass("btn-default");
      $(this).removeClass("btn-warning");
      lowPassFilterNode.active = false;
      $("#freq-slider,#quality-slider").slider("option", "disabled", true);
    }
  });
}

function reverbListener() {
  $("#reverb").click(function () {
    $(this).toggleClass("active");
    $(this).blur();
    if ($(this).hasClass("btn-default")) {
      $(this).removeClass("btn-default");
      $(this).addClass("btn-warning");
      convolver.active = true;
    } else {
      $(this).addClass("btn-default");
      $(this).removeClass("btn-warning");
      convolver.active = false;
    }
  })
}

function changeFrequency(event, ui) {
  var minValue = 40;
  var maxValue = context.sampleRate / 2;
  var numberOfOctaves = Math.log(maxValue / minValue) / Math.LN2;
  var multiplier = Math.pow(2, numberOfOctaves * (ui.value - 1.0));
  lowPassFilterNode.frequency.value = maxValue * multiplier;
}

function changeQuality(event, ui) {
  //30 is the quality multiplier, for now. 
  lowPassFilterNode.Q.value = ui.value * 30;
}

function checkAndTrigerPlayPause() {
  var $span = $('#play-pause').children("span");
  if ($span.hasClass('glyphicon-play')) {
    $span.removeClass('glyphicon-play');
    $span.addClass('glyphicon-pause');
    isPlaying = 1;
    handlePlay();
  } else {
    isPlaying = 0;
    $span.addClass('glyphicon-play');
    $span.removeClass('glyphicon-pause');
    handleStop();
  }
}

// TODO: work on this space stuff
// Currently many keys are mapped to the play/pause button, and it avoids using them in the text inputes (space, arrows, delete, ...)
//$(window).keypress(function (e) {
//  if (e.charCode === 0 || e.charCode === 32) {
//    e.preventDefault();
//    CheckAndTrigerPlayPause();
//  }
//})

function checkAndTrigerRecord() {
  if (!isRecording) {
    console.log("Record is triggered");
    isRecording = 1;
    $('#record').css('color', 'red');
    mediaRecorder.start();
  } else {
    console.log("Record is untriggered");
    isRecording = 0;
    $('#record').css('color', 'white');
    mediaRecorder.stop();
  }
}

function playPauseListener() {
  $('#play-pause').click(function () {
    checkAndTrigerPlayPause();
  });
}

function RecordListener() {
  $('#record').click(function () {
    checkAndTrigerRecord();
  });
}

function onDataAvailableInRecorderFunc(evt) {
  // push each chunk (blobs) in an array
  if (evt.data.size > 0) {
    chunks.push(evt.data);
    var blob = new Blob(chunks, {
      'type': 'audio/ogg; codecs=opus'
    });
    var soundSrc = URL.createObjectURL(blob);
    var newHtmlEl = '<div style="height:40px; margin:3px;"><audio src=' + soundSrc + ' controls=controls></audio><a style="position: absolute; margin:3px;" class="btn btn-success" href=' + soundSrc + ' download="exported_loop.ogg">Download</a><br><div>';
    $(newHtmlEl).appendTo(".exported-audio");
    chunks = [];
  }
}

function TranslateStateInActions(sequencerState) {
  var trackNames = sequencerState['trackNames'];
  var pads = sequencerState['pads'];
  var soundUrls = sequencerState['sounds'];
  var waves = sequencerState['waves'];
  var sequenceLength = sequencerState['sequenceLength'];
  var gains = sequencerState['gains'];
  var tempo = sequencerState['tempo'];

  // check if the tracks are already loaded
  if (JSON.stringify(sequencerState) != JSON.stringify(currentSequencerState)) {
    // Delete all existing tracks
    var numLocalTracks = $('.instrument').length;
    for (var i = numLocalTracks - 1; i >= 0; i--) {
      deleteTrack(i);
    }

    currentSequencerState = sequencerState;

    // change tempo
    changeTempo(tempo);

    // change seuquence length
    changeSequenceLength(sequenceLength);

    // Add tracks and load buffers
    for (var j = 0; j < trackNames.length; j++) {
      addNewTrack(j, trackNames[j], soundUrls[j], waves[j][0], waves[j][1], gains[j], pads[j]);
    }

    // Activate pads
    for (var i = 0; i < trackNames.length; i++) {
      var trackTabs = pads[i];
      for (var j = 0; j < trackTabs.length; j++) {
        toggleSelectedListenerSocket(i, j, trackTabs[j]);
      }
    }
  }
}

function toggleSelectedListener(padEl) {
  padEl.toggleClass("selected");
  var trackId = padEl.parent().parent().index();
  var padClass = padEl.attr('class');
  var padId = padClass.split(' ')[1].split('_')[1];
  var padState = (padEl.hasClass("selected")) ? 1 : 0;
  currentSequencerState.pads[trackId][padId] = padState;
  return [trackId, padId, padState]
}

function toggleSelectedListenerSocket(trackId, padId, padState) {
  var padEl = $('.instrument').eq(trackId).find('.pad').eq(parseInt(padId));
  var currentState = padEl.hasClass("selected");
  if (currentState) {
    if (padState == 0) {
      padEl.removeClass("selected");
    }
  } else {
    if (padState == 1) {
      padEl.addClass("selected");
    }
  }
  currentSequencerState.pads[trackId][padId] = padState;
}

// SEQUENCER SCHEDULER
function init() {
  initializeAudioNodes();
  loadKits();
  loadImpulseResponses();
}

function initializeAudioNodes() {
  context = new webkitAudioContext();
  recordingDest = context.createMediaStreamDestination();
  mediaRecorder = new MediaRecorder(recordingDest.stream);

  mediaRecorder.ondataavailable = onDataAvailableInRecorderFunc;

  var finalMixNode;
  if (context.createDynamicsCompressor && COMPRESSOR_ACTIVATED) {
    // Create a dynamics compressor to sweeten the overall mix.
    compressor = context.createDynamicsCompressor();
    compressor.connect(context.destination);
    finalMixNode = compressor;
  } else {
    // No compressor available in this implementation.
    finalMixNode = context.destination;
  }

  // Create master volume.
  // for now, the master volume is static, but in the future there will be a slider
  masterGainNode = context.createGain();
  masterGainNode.gain.value = 0.7; // reduce overall volume to avoid clipping
  masterGainNode.connect(finalMixNode);

  //connect all sounds to masterGainNode to play them
  //don't need this for now, no wet dry mix for effects
  // // Create effect volume.
  // effectLevelNode = context.createGain();
  // effectLevelNode.gain.value = 1.0; // effect level slider controls this
  // effectLevelNode.connect(masterGainNode);

  // Create convolver for effect
  convolver = context.createConvolver();
  convolver.active = false;
  // convolver.connect(effectLevelNode);

  //Create Low Pass Filter
  lowPassFilterNode = context.createBiquadFilter();
  //this is for backwards compatibility, the type used to be an integer
  lowPassFilterNode.type = (typeof lowPassFilterNode.type === 'string') ? 'lowpass' : 0; // LOWPASS
  //default value is max cutoff, or passing all frequencies
  lowPassFilterNode.frequency.value = context.sampleRate / 2;
  lowPassFilterNode.connect(masterGainNode);
  lowPassFilterNode.active = false;
}

function loadKits() {
  //name must be same as path
  var kit = new Kit("TR808");

  //TODO: figure out how to test if a kit is loaded
  currentKit = kit;
}

function loadImpulseResponses() {
  reverbImpulseResponse = new ImpulseResponse("sounds/impulse-responses/matrix-reverb2.wav");
  reverbImpulseResponse.load();
}

function playNote(buffer, noteTime, startTime, endTime, gainNode, soloMuteNode) {
  var voice = context.createBufferSource();
  voice.buffer = buffer;

  var currentLastNode = masterGainNode;
  if (lowPassFilterNode.active) {
    lowPassFilterNode.connect(currentLastNode);
    currentLastNode = lowPassFilterNode;
  }
  if (convolver.active) {
    convolver.buffer = reverbImpulseResponse.buffer;
    convolver.connect(currentLastNode);
    currentLastNode = convolver;
  }

  voice.connect(soloMuteNode);
  soloMuteNode.connect(gainNode);
  gainNode.connect(currentLastNode);
  gainNode.connect(recordingDest);
  voice.start(noteTime, startTime, endTime - startTime);
}

function schedule() {
  var currentTime = context.currentTime;

  // The sequence starts at startTime, so normalize currentTime so that it's 0 at the start of the sequence.
  currentTime -= startTime;

  while (noteTime < currentTime + 0.200) {
    var contextPlayTime = noteTime + startTime;
    currentSequencerState.pads.forEach(function (entry, trackId) {
      if (entry[rhythmIndex] == 1) {
        wave = currentKit.waves[trackId];
        playNote(currentKit.buffers[trackId], 
                 contextPlayTime, wave.startTime, wave.endTime, 
                 currentKit.gainNodes[trackId], currentKit.soloMuteNodes[trackId]);
      }
    });
    if (noteTime != lastDrawTime) {
      lastDrawTime = noteTime;
      drawPlayhead(rhythmIndex);
    }
    if (isPlaying)
      advanceNote();
  }
  if (isPlaying)
    timeoutId = setTimeout(schedule, 50);
}

function drawPlayhead(xindex) {
  var lastIndex = (xindex + currentKit.sequenceLength - 1) % currentKit.sequenceLength;

  //can change this to class selector to select a column
  var $newRows = $('.column_' + xindex);
  var $oldRows = $('.column_' + lastIndex);

  $newRows.addClass("playing");
  $oldRows.removeClass("playing");
}

function advanceNote() {
  // Advance time by a 16th note...
  tempo = currentSequencerState.tempo;
  var secondsPerBeat = 60.0 / tempo;
  rhythmIndex++;
  if (rhythmIndex == currentKit.sequenceLength) {
    rhythmIndex = 0;
  }

  //0.25 because each square is a 16th note
  noteTime += 0.25 * secondsPerBeat
  // if (rhythmIndex % 2) {
  //     noteTime += (0.25 + kMaxSwing * theBeat.swingFactor) * secondsPerBeat;
  // } else {
  //     noteTime += (0.25 - kMaxSwing * theBeat.swingFactor) * secondsPerBeat;
  // }

}

function handlePlay(event) {
  rhythmIndex = 0;
  noteTime = 0.0;
  startTime = context.currentTime + 0.005;
  schedule();
}

function handleStop(event) {
  clearTimeout(timeoutId);
  $(".pad").removeClass("playing");
}

function initializeTempo() {
  $("#tempo-input").val(tempo);
}

function changeTempo(tempo_input) {
  tempo = tempo_input;
  $("#tempo-input").val(tempo_input);
  currentSequencerState.tempo = tempo;
}

function changeTempoListener() {
  $("#increase-tempo").click(function () {
    if (tempo < TEMPO_MAX) {
      tempo += TEMPO_STEP;
      changeTempo(tempo);
      sendTempo(tempo);
    }
  });

  $("#decrease-tempo").click(function () {
    if (tempo > TEMPO_MIN) {
      tempo -= TEMPO_STEP;
      changeTempo(tempo);
      sendTempo(tempo);
    }
  });
}


// SEQUENCER ACTIONS
function addNewTrackEvent() {
  function newTrack() {
    var trackName = $('#newTrackName').val();
    var trackId = $('.instrument').length;
    // this action needs to be call in the same order in all clients in order to keep same order of tracks
    // we first send to server which will emit back the action
    // send to server
    sendNewTrack(trackName, null);
  }
  $('#addNewTrack').click(function () {
    newTrack();
  });
  $('#add-track-form').submit(function () {
    newTrack();
  });
}

function addNewTrackDetails() {
  $('#trackDetails').fadeIn('slow');
  $('#newTrackName').focus();

  $('#addNewTrack').on('click', function () {
    $('#trackDetails').fadeOut('slow');
  });
  $('#add-track-form').submit(function () {
    $('#trackDetails').fadeOut('slow');
  });

  $('#newTrackName').keyup(function () {
    if ($(this).val() != '') {
      $('#addNewTrack').removeAttr('disabled');
    } else {
      $('#addNewTrack').attr('disabled', 'disabled')
    }
  });
}

function addNewTrack(trackId, trackName, soundUrl = null, startTime = null, endTime = null, gain = -6, pads = null) {
  var uniqueTrackId = Date.now();

  // update sequencer state
  currentSequencerState.trackNames[trackId] = trackName;
  currentSequencerState.pads[trackId] = pads !== null ? pads : Array(64).fill(0);
  currentSequencerState.sounds[trackId] = soundUrl;
  currentSequencerState.waves[trackId] = [startTime, endTime];
  currentSequencerState.gains[trackId] = gain;

  // create html
  var padEl = '<div class="pad column_0">\n\n</div>\n';

  for (var i = 1; i < MAXLENGTH; i++) {
    if (i < currentKit.sequenceLength) {
      if (i % 16 == 0 && i != 0) {
        padEl = padEl + ' <br> ';
      }
      padEl = padEl + '<div class="pad column_' + i + '">\n\n</div>\n';
    } else {
      if (i % 16 == 0 && i != 0) {
        padEl = padEl + ' <br style="display: none;"> ';
      }
      padEl = padEl + '<div class="pad column_' + i + '" style="display: none;">\n\n</div>\n';
    }
  }

  var newTrack = '<div ondrop="drop(event)" ondragover="allowDrop(event)" ondragleave="exitDrop(event)" class="row instrument" data-instrument="' +
    trackName +
    '"><div class="col-xs-2 col-lg-2"> <a data-toggle="collapse" aria-expanded="false" aria-controls="edit-' +
    uniqueTrackId +
    '" href="#edit-' +
    uniqueTrackId +
    '" class="instrument-label"><i class="glyphicon glyphicon-chevron-right"></i> <strong class="instrumentName">' +
    trackName +
    '</strong></a></div><div class="col-xs-7 col-lg-8 pad-container">' +
    padEl +
    '</div><div class="col-xs-3 col-lg-2" title="Track gain"><input type="text" value="-6" class="dial">' +
    '<button type="button" class="mute-track btn btn-primary" data-toggle="button">M</button>' +
    '<button type="button" class="solo-track btn btn-primary" data-toggle="button">S</button>' +
    '<button class="deleteTrackButton btn btn-warning"><div class="glyphicon glyphicon-remove"></div></button></div>' + 
    '<div id="edit-' +
    uniqueTrackId +
    '" class="edit-zone collapse"><div class="waveform-container"></div><div class="waveform-timeline"></div><button class="refreshWaveRegionButton btn btn-success"><i class="glyphicon glyphicon-refresh"></i></button></div></div></div>';

  var prevTrack = $('#newTrack');
  prevTrack.before(newTrack);

  var thisTrack = $('.instrument').eq(trackId);

  // add gainNode
  currentKit.gainNodes[trackId] = context.createGain();
  addKnob(trackId, gain);
    
  // add solo mute gain node
  currentKit.soloMuteNodes[trackId] = context.createGain();
  currentKit.mutedTracks[trackId] = 1;
  currentKit.soloedTracks[trackId] = 0;

  // load wavesurfer visu
  currentKit.waves[trackId] = new Wave();
  var wave = currentKit.waves[trackId];
  var waveContainer = thisTrack.find('.waveform-container')[0];
  wave.init(thisTrack, waveContainer);
  addRefreshRegionEvent(trackId);

  // load the edit visu on the first collapse
  thisTrack.children('.edit-zone').on('shown.bs.collapse', function () {
    if (!wave.loadedAfterCollapse) {
      wave.reload();
    }
  });

  // load buffer
  if (soundUrl) {
    currentKit.loadSample(soundUrl, trackId);
    if (startTime !== 'null' && startTime !== false) {
      wave.startTime = startTime;
      wave.endTime = endTime;
    }
  }

  // add click events
  addPadClickEvent(socket, trackId);
  addDeleteTrackClickEvent(trackId);
  addRotateTriangleEvent(trackId);
  addMuteTrackEvent(trackId);
  addSoloTrackEvent(trackId);
}


// gain knob
function addKnob(trackId, gain) {
  var knob = $('.instrument').eq(trackId).find(".dial");
  knob.knob({
    width: 30,
    height: 30,
    min: -35,
    max: 6,
    step: 1,
    displayInput: false,
    thickness: 0.5,
    change: function (v) {
      var trackId = $(this.$).parents('.instrument').index();
      currentKit.changeGainNodeValue(trackId, v);
    },
    release: function (v) {
      var trackId = $(this.$).parents('.instrument').index();
      currentKit.changeGainNodeValue(trackId, v);
      // send db gain value to server
      sendTrackGain(trackId, v)
    }
  });
  knob.val(gain.toString());
  knob.trigger('change');
  currentKit.changeGainNodeValue(trackId, gain);
}

function changeTrackGain(trackId, gain) {
  var knob = $('.instrument').eq(trackId).find(".dial");
  knob.val(gain.toString());
  knob.trigger('change');
}


// change sequence length
function changeNumPads(numPads) {
  var instrumentTracks = $('.instrument');
  var numPadsNow = currentKit.sequenceLength;
  if (parseInt(numPads) > parseInt(numPadsNow)) {
    instrumentTracks.each(function (index) {
      var lineBreaks = $(this).children('.pad-container').children('br');
      var pads = $(this).children('.pad-container').children('.pad');
      for (var i = numPadsNow; i < numPads; i++) {
        if (i % 16 == 0) {
          lineBreaks.eq(i / 16 - 1).show();
        }
        pads.eq(i).show();
      }
    });
  } else if (parseInt(numPads) < parseInt(numPadsNow)) {
    instrumentTracks.each(function (index) {
      var lineBreaks = $(this).children('.pad-container').children('br');
      var pads = $(this).children('.pad-container').children('.pad');
      for (var i = numPadsNow - 1; i >= numPads; i--) {
        if (i % 16 == 0) {
          lineBreaks.eq(i / 16 - 1).hide();
        }
        pads.eq(i).hide();
      }
    });
  }
}

function changeSequenceLength(sequenceLength) {
  changeNumPads(sequenceLength);
  currentKit.changeSequenceLength(sequenceLength);
  $('#sequence-length').val(sequenceLength);
}

function addChangeSequenceLengthEvent() {
  var changeLength = function (sequenceLength) {
    if (Number.isInteger(parseFloat(sequenceLength)) && parseInt(sequenceLength) <= 64 && parseInt(sequenceLength) > 0) {
      changeSequenceLength(sequenceLength);
      sendSequenceLength(sequenceLength);
    }
  }
  $('#change-sequence-length-form').submit(function () {
    var sequenceLength = $('#sequence-length').val();
    changeLength(sequenceLength);
  });
  $('#change-sequence-length').click(function () {
    var sequenceLength = $('#sequence-length').val();
    changeLength(sequenceLength);
  });
  $('#sequence-length').change(function () {
    var sequenceLength = $('#sequence-length').val();
    changeLength(sequenceLength);
  });
}


// delete track
function addDeleteTrackClickEvent(trackId) {
  var deleteButton = $('.instrument').eq(trackId).find(".deleteTrackButton")[0];
  $(deleteButton).click(function () {
    var trackId = $(this).parents('.instrument').index();
    // this action needs to be call in the same order in all clients in order to keep same order of tracks
    //deleteTrack(trackId);
    // send to serveur
    sendDeleteTrack(trackId);
  });
}

function deleteTrack(trackId) {
  // delete html
  $('.instrument').eq(trackId).remove();

  // delete buffer
  currentKit.buffers.splice(trackId, 1);

  // delete wave
  currentKit.waves.splice(trackId, 1);

  // delete gain
  currentKit.gainNodes.splice(trackId, 1);
  
  // delete gain and solo mute lists
  currentKit.soloMuteNodes.splice(trackId, 1);
  currentKit.mutedTracks.splice(trackId, 1);
  currentKit.soloedTracks.splice(trackId, 1);

  // update sequencer state
  currentSequencerState.trackNames.splice(trackId, 1);
  currentSequencerState.sounds.splice(trackId, 1);
  currentSequencerState.pads.splice(trackId, 1);
  currentSequencerState.waves.splice(trackId, 1);
  currentSequencerState.gains.splice(trackId, 1);
}


// Mute solo track
function addMuteTrackEvent(trackId) {
  var muteTrackButton = $('.instrument').eq(trackId).find('.mute-track').eq(0);
  muteTrackButton.click(function () {
    $(this).trigger("blur");
    var trackId = $(this).parents('.instrument').index();
    toggleMuteTrack(trackId);
    solveMuteSoloConflicts();
  });
}

function addSoloTrackEvent(trackId) {
  var soloTrackButton = $('.instrument').eq(trackId).find('.solo-track').eq(0);
  soloTrackButton.click(function () {
    $(this).trigger("blur");
    var trackId = $(this).parents('.instrument').index();
    toggleSoloTrack(trackId);
    solveMuteSoloConflicts();
  });
}

function toggleSoloTrack(trackId) {
  currentKit.soloedTracks[trackId] = (currentKit.soloedTracks[trackId] == 1) ? 0 : 1;
  if (currentKit.soloedTracks[trackId] == 1 && currentKit.mutedTracks[trackId] == 0) {
    $('.instrument').eq(trackId).find('.mute-track').eq(0).button('toggle');
    toggleMuteTrack(trackId);
  }
}

function toggleMuteTrack(trackId) {
  currentKit.mutedTracks[trackId] = (currentKit.mutedTracks[trackId] == 1) ? 0 : 1;
  if (currentKit.mutedTracks[trackId] == 0 && currentKit.soloedTracks[trackId] == 1) {
    $('.instrument').eq(trackId).find('.solo-track').eq(0).button('toggle');
    toggleSoloTrack(trackId);
  }
}

function solveMuteSoloConflicts() {
  var soloedTracks = currentKit.soloedTracks;
  var mutedTracks = currentKit.mutedTracks;
  
  // Check if somes tracks are muted 
  var payableTracks = soloedTracks.includes(1) ? soloedTracks : mutedTracks;

  for (var trackId = 0; trackId < payableTracks.length; trackId++) {
    if (payableTracks[trackId]) {
      // track is not muted
      currentKit.soloMuteNodes[trackId].gain.value = 1;
    } else {
      // track is muted
      currentKit.soloMuteNodes[trackId].gain.value = 0;
    }
  }
}

// Drag and drop sounds
function allowDrop(ev) {
  ev.preventDefault();
  var target = ev.target;
  var trackEl = $(target).hasClass('row') ? $(target) : $(target).parents('.row');
  trackEl.addClass("drop-over");
}

function exitDrop(ev) {
  ev.preventDefault();
  var target = ev.target;
  var trackEl = $(target).hasClass('row') ? $(target) : $(target).parents('.row');
  trackEl.removeClass("drop-over");
}

function drag(ev) {
  currentSoundUrl = ev.target.getAttribute("sound-url");
  ev.dataTransfer.setData("text", "");
}

function drop(ev) {
  ev.preventDefault();
  var target = ev.target;
  var trackEl = $(target).hasClass('row') ? $(target) : $(target).parents('.row');
  var trackId = trackEl.index();
  currentKit.loadSample(currentSoundUrl, trackId);
  sendLoadSound(trackId, currentSoundUrl);
  trackEl.removeClass("drop-over");
}


// Wave visu
function addRefreshRegionEvent(trackId) {
  var refreshButton = $('.instrument').eq(trackId).children(".edit-zone").children(".refreshWaveRegionButton")[0];
  $(refreshButton).click(function () {
    var trackId = $(this).parents('.instrument').index();
    currentKit.waves[trackId].restartRegion();
    currentKit.waves[trackId].sendRegion();
  });
}


// enable/disable search button
$('#search-query').keyup(function () {
  if ($(this).val() != '') {
    $('#search-button').removeAttr('disabled');
  } else {
    $('#search-button').attr('disabled', 'disabled')
  }
});

// rotate triangle dropdown
function addRotateTriangleEvent(trackId) {
  $(".instrument-label").eq(trackId).click(function () {
    var trackId = $(this).parents('.instrument').index();
    $('.instrument').eq(trackId).find(".glyphicon").toggleClass('rotation');
  });
}


// Presets
function saveCurrentSequencerstatePreset(presetName) {
  sendSequencerPreset(JSON.stringify(currentSequencerState), presetName);
}

function loadSequencerStatePreset(sequencerPresetState) {
  TranslateStateInActions(JSON.parse(sequencerPresetState));
}

$("#save-preset").click(function () {
  var presetName = sequencerPresetNames.length;
  saveCurrentSequencerstatePreset(presetName);
});

function addSequencerPreset(presetName) {
  sequencerPresetNames.push(presetName);
  $("#preset-container").append('<div id="preset-' + presetName + '" class="dropdown-item btn" type="button">' + presetName + '</div>');
  $("#preset-" + presetName).click(function () {
    sendLoadSequencerPreset(sequencerPresetNames.indexOf(presetName));
  });
}