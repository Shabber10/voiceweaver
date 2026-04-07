const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

async function testTimings() {
    const tts = new MsEdgeTTS();
    // Enable word boundary metadata
    await tts.setMetadata('en-US-AriaNeural', OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
        wordBoundaryEnabled: true
    });
    const { audioStream, metadataStream } = tts.toStream('Hello world, this is a test.');

    audioStream.on('data', (data) => {
        // Audio data
    });

    if (metadataStream) {
        metadataStream.on('data', (data) => {
            console.log('Metadata content:', data.toString());
        });
    } else {
        console.log('No metadata stream returned');
    }

    audioStream.on('end', () => {
        console.log('Audio stream ended');
    });
}

testTimings().catch(console.error);
