document.addEventListener('DOMContentLoaded', () => {
    // --- 定数と変数の設定 ---
    const NOTES = ['B5', 'A#5', 'A5', 'G#5', 'G5', 'F#5', 'F5', 'E5', 'D#5', 'D5', 'C#5', 'C5',
                   'B4', 'A#4', 'A4', 'G#4', 'G4', 'F#4', 'F4', 'E4', 'D#4', 'D4', 'C#4', 'C4',
                   'B3', 'A#3', 'A3', 'G#3', 'G3', 'F#3', 'F3', 'E3', 'D#3', 'D3', 'C#3', 'C3'];
    const BEATS_PER_MEASURE = 16; // 1小節あたりの拍数 (4/4拍子なので16分音符16個)

    // --- DOM要素の取得 ---
    const pianoRoll = document.getElementById('piano-roll');
    const playStopButton = document.getElementById('play-stop-button');
    const bpmInput = document.getElementById('bpm');
    const downloadMidiButton = document.getElementById('download-midi-button');
    const loadingScreen = document.getElementById('loading-screen');
    const scoreDiv = document.getElementById('score');
    const pianoRollContainer = document.getElementById('piano-roll-container');
    const scoreContainer = document.getElementById('score-container');

    // --- 状態変数 ---
    let numBeats = BEATS_PER_MEASURE * 2; // 曲の長さを可変に (初期は2小節)
    let sampler;
    let sequence;
    let gridData = Array(NOTES.length).fill(null).map(() => Array(numBeats).fill(false));
    let isAddingMeasure = false; // 小節追加処理中のフラグ

    // --- VexFlow（譜面描画）のセットアップ ---
    const { Factory, StaveNote, Formatter } = Vex.Flow;
    let vf;

    // --- メイン処理 ---
    initialize();

    function initialize() {
        // ピアノ音源の読み込み
        sampler = new Tone.Sampler({
            urls: { 'C4': 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', 'A4': 'A4.mp3' },
            release: 1,
            baseUrl: 'https://tonejs.github.io/audio/salamander/',
            onload: () => {
                loadingScreen.style.display = 'none';
                console.log('ピアノ音源の読み込みが完了しました。');
            }
        }).toDestination();
        
        // UIの初期描画
        buildUI();
        
        // イベントリスナーの設定
        setupEventListeners();
    }

    // --- UI構築 ---
    function buildUI() {
        // ピアノロールと譜面をクリア
        pianoRoll.innerHTML = '';
        scoreDiv.innerHTML = '';

        // ピアノロールのグリッドサイズを設定
        pianoRoll.style.gridTemplateColumns = `50px repeat(${numBeats}, 40px)`;
        
        // ピアノロールのセルを生成
        for (let i = 0; i < NOTES.length; i++) {
            const noteName = document.createElement('div');
            noteName.classList.add('cell-row-header');
            noteName.textContent = NOTES[i].replace('#', '♯');
            pianoRoll.appendChild(noteName);
            for (let j = 0; j < numBeats; j++) {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                if (NOTES[i].startsWith('C')) cell.classList.add('key-c');
                if (gridData[i][j]) cell.classList.add('active'); // 状態を復元
                cell.dataset.row = i;
                cell.dataset.col = j;
                pianoRoll.appendChild(cell);
            }
        }
        
        // 譜面を描画
        drawScore();
    }
    
    // --- イベントリスナー設定 ---
    function setupEventListeners() {
        pianoRoll.addEventListener('click', (event) => {
            if (!event.target.classList.contains('cell')) return;
            const row = event.target.dataset.row;
            const col = event.target.dataset.col;

            gridData[row][col] = !gridData[row][col];
            event.target.classList.toggle('active', gridData[row][col]);

            if (gridData[row][col]) {
                sampler.triggerAttack(NOTES[row]);
            }
            drawScore(); // ノートを変更したら譜面を再描画
        });

        playStopButton.addEventListener('click', async () => {
            if (Tone.context.state !== 'running') await Tone.start();
            Tone.Transport.state === 'started' ? stopPlayback() : startPlayback();
        });
        
        bpmInput.addEventListener('change', () => {
            Tone.Transport.bpm.value = parseInt(bpmInput.value);
        });

        downloadMidiButton.addEventListener('click', downloadMidi);
        
        // 無限スクロールのためのイベントリスナー
        pianoRollContainer.addEventListener('scroll', () => {
            scoreContainer.scrollLeft = pianoRollContainer.scrollLeft;
            // スクロールが右端近くに来たら新しい小節を追加
            if (pianoRollContainer.scrollLeft + pianoRollContainer.clientWidth >= pianoRollContainer.scrollWidth - 100) {
                addMeasure();
            }
        });
        scoreContainer.addEventListener('scroll', () => {
            pianoRollContainer.scrollLeft = scoreContainer.scrollLeft;
        });
    }

    // --- 機能関数 ---

    // 新しい小節を追加する関数
    function addMeasure() {
        if (isAddingMeasure) return; // 追加処理中なら何もしない
        isAddingMeasure = true;
        
        const currentScroll = pianoRollContainer.scrollLeft; // 現在のスクロール位置を保持
        
        numBeats += BEATS_PER_MEASURE;
        
        // データ構造を拡張
        gridData.forEach(row => {
            for(let i = 0; i < BEATS_PER_MEASURE; i++) {
                row.push(false);
            }
        });
        
        // UIを再構築
        buildUI();
        
        // スクロール位置を復元
        pianoRollContainer.scrollLeft = currentScroll;
        
        console.log(`小節を追加しました。現在の合計拍数: ${numBeats}`);
        
        // 連続で追加されないように少し待つ
        setTimeout(() => { isAddingMeasure = false; }, 100);
    }

    // 譜面描画関数
    function drawScore() {
        if (vf) vf.getContext().clear();
        
        vf = new Factory({ renderer: { elementId: 'score', width: 40 * numBeats + 100, height: 150 } });

        const staveWidth = 40 * BEATS_PER_MEASURE;
        let x = 10;
        
        for (let measure = 0; measure < numBeats / BEATS_PER_MEASURE; measure++) {
            const stave = vf.Stave(x, 20, staveWidth);
            if (measure === 0) {
                stave.addClef("treble").addTimeSignature("4/4");
            }
            stave.setContext(vf.getContext()).draw();
            
            const notesForMeasure = [];
            const startBeat = measure * BEATS_PER_MEASURE;
            
            for (let col = startBeat; col < startBeat + BEATS_PER_MEASURE; col++) {
                const activeNotes = [];
                for (let row = 0; row < NOTES.length; row++) {
                    if (gridData[row][col]) {
                        // VexFlowのキー形式 'C#4' -> 'c#/4' に変換
                        const note = NOTES[row].toLowerCase().replace('#', '#/').slice(0,-1) + '/' + NOTES[row].slice(-1);
                        activeNotes.push(note);
                    }
                }
                
                if (activeNotes.length > 0) {
                    notesForMeasure.push(new StaveNote({ keys: activeNotes, duration: "16" }));
                } else {
                    notesForMeasure.push(new StaveNote({ keys: ["b/4"], duration: "16r" }));
                }
            }
            
            Formatter.FormatAndDraw(vf.getContext(), stave, notesForMeasure);
            x += staveWidth;
        }
    }

    // 再生開始
    function startPlayback() {
        const events = [];
        for (let col = 0; col < numBeats; col++) {
            const notesAtThisBeat = [];
            for (let row = 0; row < NOTES.length; row++) {
                if (gridData[row][col]) {
                    notesAtThisBeat.push(NOTES[row]);
                }
            }
            if (notesAtThisBeat.length > 0) {
                const time = `${Math.floor(col / BEATS_PER_MEASURE)}:${Math.floor((col % BEATS_PER_MEASURE) / 4)}:${col % 4}`;
                events.push({ time: time, notes: notesAtThisBeat });
            }
        }

        if (sequence) sequence.dispose();
        sequence = new Tone.Part((time, value) => {
            sampler.triggerAttackRelease(value.notes, '16n', time);
        }, events).start(0);

        sequence.loop = true;
        sequence.loopEnd = `${Math.floor(numBeats / BEATS_PER_MEASURE)}m`;

        Tone.Transport.bpm.value = parseInt(bpmInput.value);
        Tone.Transport.start();
        playStopButton.textContent = '停止';
        playStopButton.classList.add('playing');
    }

    // 再生停止
    function stopPlayback() {
        Tone.Transport.stop();
        if (sequence) sequence.stop();
        playStopButton.textContent = '再生';
        playStopButton.classList.remove('playing');
    }

    // MIDIダウンロード
    function downloadMidi() {
        const writer = new MidiWriter.Writer();
        const track = new MidiWriter.Track();
        writer.addTrack(track);
        track.addEvent(new MidiWriter.ProgramChangeEvent({instrument: 1}));

        for (let col = 0; col < numBeats; col++) {
            const notesAtThisBeat = [];
            for (let row = 0; row < NOTES.length; row++) {
                if (gridData[row][col]) {
                    notesAtThisBeat.push(NOTES[row]);
                }
            }
            if (notesAtThisBeat.length > 0) {
                track.addEvent(new MidiWriter.NoteEvent({
                    pitch: notesAtThisBeat,
                    duration: '16',
                    startTick: col * (MidiWriter.constants.TPQ / 4)
                }));
            }
        }
        const link = document.createElement('a');
        link.href = writer.dataUri();
        link.download = 'melody.mid';
        link.click();
    }
});
