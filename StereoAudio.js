// ==UserScript==
// @name         Diep Khuc Audio Quality
// @version      1.0
// @description  Balanced audio quality patch for Diep Khuc
// @match *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  function buildAudioConstraints(raw) {
    if (raw === false) return false;
    const base = raw && typeof raw === 'object' ? raw : {};
    return Object.assign({}, base, {
      channelCount: 2,
      sampleRate: 48000,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    });
  }

  function rewriteSdp(sdp) {
    if (typeof sdp !== 'string' || !sdp) return sdp;

    let out = sdp;
    const payload = out.match(/a=rtpmap:(\d+) opus\/48000\/(\d+)/i);
    if (!payload) return out;

    const pt = payload[1];
    const fmtpLineRegex = new RegExp(`a=fmtp:${pt} .*`, 'i');

    if (fmtpLineRegex.test(out)) {
      const oldLine = out.match(fmtpLineRegex)[0];
      let newLine = oldLine;

      if (!/stereo=1/i.test(newLine)) newLine += ';stereo=1';
      if (!/sprop-stereo=1/i.test(newLine)) newLine += ';sprop-stereo=1';
      if (!/usedtx=0/i.test(newLine)) newLine += ';usedtx=0';

      out = out.replace(oldLine, newLine);
    } else {
      out += `a=fmtp:${pt} stereo=1;sprop-stereo=1;usedtx=0\r\n`;
    }

    return out;
  }

  function patchPeer() {
    const Ctor = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (!Ctor || Ctor.__dkAudioQuality) return;

    const proto = Ctor.prototype;
    const origCreateOffer = proto.createOffer;
    const origCreateAnswer = proto.createAnswer;
    const origSetLocal = proto.setLocalDescription;
    const origSetRemote = proto.setRemoteDescription;

    proto.createOffer = function (...args) {
      return Promise.resolve(origCreateOffer.apply(this, args)).then((offer) => {
        if (offer && offer.sdp) {
          return new RTCSessionDescription({ type: offer.type, sdp: rewriteSdp(offer.sdp) });
        }
        return offer;
      });
    };

    proto.createAnswer = function (...args) {
      return Promise.resolve(origCreateAnswer.apply(this, args)).then((answer) => {
        if (answer && answer.sdp) {
          return new RTCSessionDescription({ type: answer.type, sdp: rewriteSdp(answer.sdp) });
        }
        return answer;
      });
    };

    proto.setLocalDescription = function (desc, ...rest) {
      if (desc && desc.sdp) {
        desc = new RTCSessionDescription({ type: desc.type, sdp: rewriteSdp(desc.sdp) });
      }
      return origSetLocal.call(this, desc, ...rest);
    };

    proto.setRemoteDescription = function (desc, ...rest) {
      if (desc && desc.sdp) {
        desc = new RTCSessionDescription({ type: desc.type, sdp: rewriteSdp(desc.sdp) });
      }
      return origSetRemote.call(this, desc, ...rest);
    };

    Ctor.__dkAudioQuality = true;
  }

  function patchGetUserMedia() {
    const gm = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    if (!gm || gm.__dkAudioQuality) return;

    navigator.mediaDevices.getUserMedia = function (constraints, ...rest) {
      const clone = constraints && typeof constraints === 'object'
        ? JSON.parse(JSON.stringify(constraints))
        : {};

      if (clone.audio !== undefined) {
        clone.audio = buildAudioConstraints(clone.audio);
      }

      return gm.call(this, clone, ...rest);
    };

    navigator.mediaDevices.getUserMedia.__dkAudioQuality = true;
  }

  patchGetUserMedia();
  patchPeer();
  console.log('[dk-audio-quality] loaded');
})();
