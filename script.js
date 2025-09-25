document.addEventListener('DOMContentLoaded', () => {
    // --- 定数と変数の設定 ---
    const NOTES = ['B5', 'A#5', 'A5', 'G#5', 'G5', 'F#5', 'F5', 'E5', 'D#5', 'D5', 'C#5', 'C5',
                   'B4', 'A#4', 'A4', 'G#4', 'G4', 'F#4', 'F4', 'E4', 'D#4', 'D4', 'C#4', 'C4',
                   'B3', 'A#3', 'A3', 'G#3', 'G3', 'F#3', 'F3', 'E3', 'D#3', 'D3', 'C#3', 'C3'];
    const NUM_BEATS = 32; // 拍の数（横の長さ）
    const pianoRoll = document.getElementById('piano-roll');
    const playStopButton = document.getElementById('play-stop-button');
    const bpmInput = document.getElementById('bpm');
    const downloadMidiButton = document.getElementById('download-midi-button');
    const loadingScreen = document.getElementById('loading-screen');

    let sampler; // ピアノ音源
    let sequence; // Tone.jsのシーケンス
    let gridData = Array(NOTES.length).fill(null).map(() => Array(NUM_BEATS).fill(false)); // ノートの状態を保存する2次元配列

    // --- ピアノ音源の読み込み ---
    // Tone.jsのSamplerを使って、公開されているピアノ音源を読み込みます
    sampler = new Tone.Sampler({
        urls: {
            'C4': 'C4.mp3',
            'D#4': 'Ds4.mp3',
            'F#4': 'Fs4.mp3',
            'A4': 'A4.mp3',
        },
        release: 1,
        baseUrl: 'https://tonejs.github.io/audio/salamander/',
        onload: () => {
            // 読み込みが完了したらローディング画面を非表示にする
            loadingScreen.style.display = 'none';
            console.log('ピアノ音源の読み込みが完了しました。');
        }
    }).toDestination();


    // --- ピアノロールのUIを作成 ---
    pianoRoll.style.gridTemplateColumns = `50px repeat(${NUM_BEATS}, 40px)`;
    for (let i = 0; i < NOTES.length; i++) {
        // 音名ラベルを追加
        const noteName = document.createElement('div');
        noteName.classList.add('cell-row-header');
        noteName.textContent = NOTES[i].replace('#', '♯');
        pianoRoll.appendChild(noteName);
        
        // ノート入力セルを追加
        for (let j = 0; j < NUM_BEATS; j++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            if (NOTES[i].startsWith('C')) {
                cell.classList.add('key-c');
            }
            cell.dataset.row = i;
            cell.dataset.col = j;
            pianoRoll.appendChild(cell);
        }
    }

    // --- イベントリスナーの設定 ---

    // ピアノロールのセルをクリックした時の処理
    pianoRoll.addEventListener('click', (event) => {
        if (!event.target.classList.contains('cell')) return;

        const row = event.target.dataset.row;
        const col = event.target.dataset.col;

        // 状態を反転させる
        gridData[row][col] = !gridData[row][col];
        event.target.classList.toggle('active', gridData[row][col]);

        // クリックした音を鳴らす
        if (gridData[row][col]) {
            sampler.triggerAttack(NOTES[row]);
        }
    });

    // 再生・停止ボタンの処理
    playStopButton.addEventListener('click', async () => {
        // Tone.jsを開始（ユーザー操作が必須）
        if (Tone.context.state !== 'running') {
            await Tone.start();
        }

        if (Tone.Transport.state === 'started') {
            stopPlayback();
        } else {
            startPlayback();
        }
    });
    
    // BPM（テンポ）が変更された時の処理
    bpmInput.addEventListener('change', () => {
        Tone.Transport.bpm.value = parseInt(bpmInput.value);
    });

    // MIDIダウンロードボタンの処理
    downloadMidiButton.addEventListener('click', () => {
        const writer = new MidiWriter.Writer();
        const track = new MidiWriter.Track();
        writer.addTrack(track);

        // ピアノ音源を指定
        track.addEvent(new MidiWriter.ProgramChangeEvent({instrument: 1}));

        // グリッドデータをMIDIイベントに変換
        for (let col = 0; col < NUM_BEATS; col++) {
            const notesAtThisBeat = [];
            for (let row = 0; row < NOTES.length; row++) {
                if (gridData[row][col]) {
                    notesAtThisBeat.push(NOTES[row]);
                }
            }
            if (notesAtThisBeat.length > 0) {
                track.addEvent(new MidiWriter.NoteEvent({
                    pitch: notesAtThisBeat,
                    duration: '4', // 16分音符の長さ
                    startTick: col * (MidiWriter.constants.TPQ / 4) // 1拍=TPQ, 16分音符=TPQ/4
                }));
            }
        }
        
        // ファイルを生成してダウンロード
        const dataUri = writer.dataUri();
        const link = document.createElement('a');
        link.href = dataUri;
        link.download = 'melody.mid';
        link.click();
    });

    // --- 再生関連の関数 ---
    
    function startPlayback() {
        // 現在のグリッドデータからシーケンスを作成
        const events = [];
        for (let col = 0; col < NUM_BEATS; col++) {
            const notesAtThisBeat = [];
            for (let row = 0; row < NOTES.length; row++) {
                if (gridData[row][col]) {
                    notesAtThisBeat.push(NOTES[row]);
                }
            }
            if (notesAtThisBeat.length > 0) {
                events.push({ time: `0:0:${col}`, notes: notesAtThisBeat });
            }
        }

        // 既存のシーケンスがあれば破棄
        if (sequence) {
            sequence.dispose();
        }

        // 新しいシーケンスを作成
        sequence = new Tone.Part((time, value) => {
            sampler.triggerAttackRelease(value.notes, '16n', time);
            // 再生位置をUIに反映
            Tone.Draw.schedule(() => {
                highlightCurrentBeat(value.time.split(':')[2]);
            }, time);
        }, events).start(0);

        sequence.loop = true;
        sequence.loopEnd = `${Math.floor(NUM_BEATS / 4)}m`; // 小節数でループ終了を指定

        // 再生開始
        Tone.Transport.bpm.value = parseInt(bpmInput.value);
        Tone.Transport.start();
        playStopButton.textContent = '停止';
        playStopButton.classList.add('playing');
    }

    function stopPlayback() {
        Tone.Transport.stop();
        if (sequence) {
            sequence.stop();
        }
        playStopButton.textContent = '再生';
        playStopButton.classList.remove('playing');
        clearHighlight();
    }
    
    // 再生位置をハイライトする関数
    let lastHighlightedCol = -1;
    function highlightCurrentBeat(col) {
        clearHighlight();
        const cells = document.querySelectorAll(`.cell[data-col='${col}']`);
        cells.forEach(cell => cell.style.backgroundColor = 'rgba(0, 123, 255, 0.3)');
        lastHighlightedCol = col;
    }
    
    // ハイライトを消す関数
    function clearHighlight() {
        if(lastHighlightedCol !== -1) {
            const cells = document.querySelectorAll(`.cell[data-col='${lastHighlightedCol}']`);
            cells.forEach(cell => cell.style.backgroundColor = ''); // 元のスタイルに戻す
        }
    }
});
