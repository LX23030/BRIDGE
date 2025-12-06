

class AudioService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private isMuted: boolean = false;
  private bgmTimeout: number | null = null;
  private nextNoteTime: number = 0;
  private isBgmPlaying: boolean = false;

  constructor() {}

  private init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.25;
      this.masterGain.connect(this.ctx.destination);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.1; // Lower volume for BGM
      this.bgmGain.connect(this.ctx.destination);
    } catch (e) {
      console.error("Web Audio API not supported", e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.ctx) {
      if (this.isMuted) {
        if (this.bgmGain) this.bgmGain.gain.setValueAtTime(0, this.ctx.currentTime);
      } else {
        if (this.bgmGain) this.bgmGain.gain.setValueAtTime(0.1, this.ctx.currentTime);
      }
    }
    return this.isMuted;
  }

  startBGM() {
    this.init();
    if (this.isBgmPlaying) return;
    this.isBgmPlaying = true;
    this.nextNoteTime = this.ctx!.currentTime;
    this.scheduleBGM();
  }

  stopBGM() {
    this.isBgmPlaying = false;
    if (this.bgmTimeout) {
      window.clearTimeout(this.bgmTimeout);
      this.bgmTimeout = null;
    }
  }

  private scheduleBGM() {
    if (!this.isBgmPlaying || !this.ctx || !this.bgmGain) return;

    // Simple minimal ambient melody
    // C Major: C E G, F Major: F A C
    // Slow tempo
    const lookahead = 0.1; // seconds
    const interval = 0.05; // seconds to check

    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      this.playBGMNote(this.nextNoteTime);
      this.nextNoteTime += 2.0; // Play a chord every 2 seconds
    }

    this.bgmTimeout = window.setTimeout(() => this.scheduleBGM(), interval * 1000);
  }

  private playBGMNote(time: number) {
    if (!this.ctx || !this.bgmGain) return;

    const chords = [
      [261.63, 329.63, 392.00], // C
      [261.63, 329.63, 392.00], // C
      [220.00, 261.63, 329.63], // Am
      [174.61, 220.00, 261.63], // F
      [196.00, 246.94, 293.66], // G
    ];

    // Pick a chord based on time to create a progression
    const progressionIndex = Math.floor(time / 2) % chords.length;
    const currentChord = chords[progressionIndex];

    currentChord.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      
      osc.connect(gain);
      gain.connect(this.bgmGain!);

      osc.type = 'sine';
      osc.frequency.value = freq;
      
      // Soft attack and release
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.05, time + 0.5); // Fade in
      gain.gain.exponentialRampToValueAtTime(0.001, time + 1.8); // Fade out

      osc.start(time);
      osc.stop(time + 2.0);
    });

    // Occasional high note (sparkle)
    if (Math.random() > 0.6) {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.connect(gain);
      gain.connect(this.bgmGain!);
      osc.type = 'triangle';
      osc.frequency.value = currentChord[0] * 4; // 2 octaves up
      
      gain.gain.setValueAtTime(0, time + 0.5);
      gain.gain.linearRampToValueAtTime(0.02, time + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 1.0);
      
      osc.start(time + 0.5);
      osc.stop(time + 1.0);
    }
  }

  playJump() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    this.resume();
    
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.15);
    
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    
    osc.start();
    osc.stop(t + 0.15);
  }

  playLand() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.1);
    
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    
    osc.start();
    osc.stop(t + 0.1);
  }

  playTetherConnect() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

    osc.start();
    osc.stop(t + 0.15);
  }

  playTetherDisconnect() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

    osc.start();
    osc.stop(t + 0.15);
  }

  playDraw() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    this.resume();
    
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150 + Math.random() * 100, t);
    
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    
    osc.start();
    osc.stop(t + 0.08);
  }

  playButton() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.type = 'square';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);

    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

    osc.start();
    osc.stop(t + 0.1);
  }

  playWin() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    this.resume();

    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    
    notes.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.connect(gain);
        gain.connect(this.masterGain!);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.1);
        gain.gain.setValueAtTime(0.15, t + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.8);
        
        osc.start(t + i * 0.1);
        osc.stop(t + i * 0.1 + 0.8);
    });
  }

  playGameOver() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.linearRampToValueAtTime(50, t + 0.5);
    
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.linearRampToValueAtTime(0.001, t + 0.5);
    
    osc.start();
    osc.stop(t + 0.5);
  }

  playBossHit() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    this.resume();
    
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(20, t + 0.3);
    
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.3);
    
    osc.start();
    osc.stop(t + 0.3);
  }

  playBossShoot() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    this.resume();
    
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
    
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.1);
    
    osc.start();
    osc.stop(t + 0.1);
  }

  playPlayerHit() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    this.resume();
    
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.1);
    
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    
    osc.start();
    osc.stop(t + 0.1);
  }
}

export const audioService = new AudioService();
