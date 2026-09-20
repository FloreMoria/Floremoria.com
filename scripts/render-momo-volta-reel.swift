import Foundation
import AVFoundation
import CoreGraphics
import CoreText
import AppKit

print("[MOMO RENDERER] Avvio compilazione video 9:16 per Alessandro Volta...")

let width: Int = 1080
let height: Int = 1920
let fps: Int32 = 30
let durationSeconds: Double = 45.0
let totalFrames = Int(durationSeconds * Double(fps))

let outputDir = "/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/public/media/social/momo"
let audioDir = outputDir + "/audio"
try? FileManager.default.createDirectory(atPath: audioDir, withIntermediateDirectories: true)

let videoOutputPath = outputDir + "/test_volta_camnago_reel.mp4"
let srtOutputPath = outputDir + "/test_volta_camnago_reel.srt"

// 1. GENERATE SRT SUBTITLES
let srtContent = """
1
00:00:00,000 --> 00:00:03,000
Qui riposa l'uomo che ha dato la scintilla al mondo moderno.

2
00:00:04,000 --> 00:00:20,000
Siamo a Camnago Volta, Como. Il mausoleo neoclassico circolare custodisce il busto in marmo di Comolli e il rilievo della celebre pila.

3
00:00:21,000 --> 00:00:40,000
L'invenzione della pila e l'eredità silenziosa custodita tra le colline di Como testimoniano come la scintilla del genio continui a vivere.

4
00:00:41,000 --> 00:00:45,000
Un gesto di cura e rispetto per chi ha illuminato la storia. FloreMoria: la memoria eterna.
"""
try? srtContent.write(toFile: srtOutputPath, atomically: true, encoding: .utf8)
print("[MOMO RENDERER] SRT generato in: \(srtOutputPath)")

// 2. GENERATE NARRATION AUDIO
let narrationScript = """
Qui riposa l'uomo che ha dato la scintilla al mondo moderno.
Siamo a Camnago Volta, a Como. Il mausoleo neoclassico circolare custodisce il busto in marmo di Comolli e il rilievo della celebre pila.
L'invenzione della pila e l'eredità silenziosa custodita tra le colline di Como testimoniano come la scintilla del genio continui a vivere nel silenzio della memoria.
Un gesto sobrio di cura e rispetto per chi ha illuminato la storia. FloreMoria: la memoria eterna.
"""

let voiceAiffPath = audioDir + "/volta_narration.aiff"
let voiceWavPath = audioDir + "/volta_narration.wav"
let musicWavPath = audioDir + "/adagio_strings_cc0.wav"

// Use macOS say with Italian voice
let sayProcess = Process()
sayProcess.executableURL = URL(fileURLWithPath: "/usr/bin/say")
sayProcess.arguments = ["-v", "Alice", "-r", "160", "-o", voiceAiffPath, narrationScript]
try? sayProcess.run()
sayProcess.waitUntilExit()

// Convert AIFF to WAV
let convProcess = Process()
convProcess.executableURL = URL(fileURLWithPath: "/usr/bin/afconvert")
convProcess.arguments = ["-f", "WAVE", "-d", "LEI16@44100", voiceAiffPath, voiceWavPath]
try? convProcess.run()
convProcess.waitUntilExit()

// Generate Neoclassical Music Audio (Piano + String chords in A Minor / C Major)
func generateNeoclassicalAudio(duration: Double, sampleRate: Double = 44100.0) -> Data {
    let numSamples = Int(duration * sampleRate)
    var pcmData = Data(capacity: numSamples * 4) // 16-bit stereo = 4 bytes per sample
    
    // Chord progressions: Am -> F -> C -> G -> Dm -> Am -> Em -> Am
    let chordFrequencies: [[Double]] = [
        [220.0, 261.63, 329.63, 440.0],  // Am
        [174.61, 220.0, 261.63, 349.23], // F
        [130.81, 196.0, 261.63, 329.63], // C
        [196.0, 246.94, 293.66, 392.0],  // G
        [146.83, 220.0, 261.63, 293.66], // Dm
        [220.0, 261.63, 329.63, 440.0],  // Am
        [164.81, 196.0, 246.94, 329.63], // Em
        [220.0, 261.63, 329.63, 440.0]   // Am (final)
    ]
    
    let chordDuration = duration / Double(chordFrequencies.count)
    
    for i in 0..<numSamples {
        let t = Double(i) / sampleRate
        let chordIndex = min(Int(t / chordDuration), chordFrequencies.count - 1)
        let freqs = chordFrequencies[chordIndex]
        let chordT = t.truncatingRemainder(dividingBy: chordDuration)
        
        let arpIndex = Int((chordT * 2.0).truncatingRemainder(dividingBy: Double(freqs.count)))
        let arpF = freqs[arpIndex]
        
        var sampleL: Double = 0.0
        var sampleR: Double = 0.0
        
        // Pad Strings (sustained warm sine + soft harmonics)
        for f in freqs {
            let env = sin(Double.pi * (chordT / chordDuration))
            let s1 = sin(2.0 * Double.pi * f * t) * 0.15
            let s2 = sin(2.0 * Double.pi * (f * 2.002) * t) * 0.05
            let cello = sin(2.0 * Double.pi * (f * 0.5) * t) * 0.2
            sampleL += (s1 + s2 + cello) * env
            sampleR += (s1 * 0.9 + s2 * 1.1 + cello) * env
        }
        
        // Soft Piano strike
        let pianoDecay = exp(-chordT * 1.5)
        let pianoNote = sin(2.0 * Double.pi * arpF * t) * 0.25 * pianoDecay
        sampleL += pianoNote * 0.8
        sampleR += pianoNote * 0.8
        
        // Master volume with fade-in / fade-out
        let masterFade = min(1.0, min(t / 2.0, (duration - t) / 3.0))
        sampleL *= masterFade * 0.6
        sampleR *= masterFade * 0.6
        
        let intL = Int16(max(-32767.0, min(32767.0, sampleL * 32767.0)))
        let intR = Int16(max(-32767.0, min(32767.0, sampleR * 32767.0)))
        
        var l = intL.littleEndian
        var r = intR.littleEndian
        pcmData.append(UnsafeBufferPointer(start: &l, count: 1))
        pcmData.append(UnsafeBufferPointer(start: &r, count: 1))
    }
    
    // Create WAV header
    var wavHeader = Data()
    let dataSize = UInt32(pcmData.count)
    let chunkSize = 36 + dataSize
    wavHeader.append("RIFF".data(using: .ascii)!)
    var cs = chunkSize.littleEndian; wavHeader.append(UnsafeBufferPointer(start: &cs, count: 1))
    wavHeader.append("WAVEfmt ".data(using: .ascii)!)
    var subchunk1Size: UInt32 = 16; wavHeader.append(UnsafeBufferPointer(start: &subchunk1Size, count: 1))
    var audioFormat: UInt16 = 1; wavHeader.append(UnsafeBufferPointer(start: &audioFormat, count: 1))
    var numChannels: UInt16 = 2; wavHeader.append(UnsafeBufferPointer(start: &numChannels, count: 1))
    var sRate: UInt32 = UInt32(sampleRate); wavHeader.append(UnsafeBufferPointer(start: &sRate, count: 1))
    var byteRate: UInt32 = UInt32(sampleRate * 4); wavHeader.append(UnsafeBufferPointer(start: &byteRate, count: 1))
    var blockAlign: UInt16 = 4; wavHeader.append(UnsafeBufferPointer(start: &blockAlign, count: 1))
    var bitsPerSample: UInt16 = 16; wavHeader.append(UnsafeBufferPointer(start: &bitsPerSample, count: 1))
    wavHeader.append("data".data(using: .ascii)!)
    var ds = dataSize.littleEndian; wavHeader.append(UnsafeBufferPointer(start: &ds, count: 1))
    
    return wavHeader + pcmData
}

let musicData = generateNeoclassicalAudio(duration: durationSeconds)
try? musicData.write(to: URL(fileURLWithPath: musicWavPath))
print("[MOMO RENDERER] Traccia musicale neoclassical generata in: \(musicWavPath)")

// 3. RENDER 9:16 VIDEO WITH COREGRAPHICS & AVFOUNDATION
if FileManager.default.fileExists(atPath: videoOutputPath) {
    try? FileManager.default.removeItem(atPath: videoOutputPath)
}

let outputURL = URL(fileURLWithPath: videoOutputPath)
guard let writer = try? AVAssetWriter(outputURL: outputURL, fileType: .mp4) else {
    fatalError("Impossibile creare AVAssetWriter")
}

let videoSettings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 6_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
    ]
]

let writerInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
writerInput.expectsMediaDataInRealTime = false

let sourcePixelBufferAttributes: [String: Any] = [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
    kCVPixelBufferCGImageCompatibilityKey as String: true,
    kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
]

let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: writerInput,
    sourcePixelBufferAttributes: sourcePixelBufferAttributes
)

writer.add(writerInput)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

func drawFrame(ctx: CGContext, frameIdx: Int, totalFrames: Int) {
    let t = Double(frameIdx) / Double(fps)
    
    // Background gradient (Quiet Luxury deep charcoal & warm stone)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bgColors: [CGColor]
    
    if t < 4.0 {
        bgColors = [
            CGColor(red: 0.08, green: 0.08, blue: 0.09, alpha: 1.0),
            CGColor(red: 0.15, green: 0.13, blue: 0.12, alpha: 1.0),
            CGColor(red: 0.05, green: 0.05, blue: 0.06, alpha: 1.0)
        ]
    } else if t < 21.0 {
        bgColors = [
            CGColor(red: 0.12, green: 0.11, blue: 0.10, alpha: 1.0),
            CGColor(red: 0.22, green: 0.19, blue: 0.16, alpha: 1.0),
            CGColor(red: 0.09, green: 0.08, blue: 0.08, alpha: 1.0)
        ]
    } else if t < 41.0 {
        bgColors = [
            CGColor(red: 0.07, green: 0.09, blue: 0.12, alpha: 1.0),
            CGColor(red: 0.14, green: 0.18, blue: 0.22, alpha: 1.0),
            CGColor(red: 0.05, green: 0.06, blue: 0.08, alpha: 1.0)
        ]
    } else {
        bgColors = [
            CGColor(red: 0.10, green: 0.10, blue: 0.09, alpha: 1.0),
            CGColor(red: 0.20, green: 0.18, blue: 0.15, alpha: 1.0),
            CGColor(red: 0.08, green: 0.08, blue: 0.07, alpha: 1.0)
        ]
    }
    
    let locations: [CGFloat] = [0.0, 0.5, 1.0]
    if let gradient = CGGradient(colorsSpace: colorSpace, colors: bgColors as CFArray, locations: locations) {
        ctx.drawLinearGradient(gradient, start: CGPoint(x: 540, y: 1920), end: CGPoint(x: 540, y: 0), options: [])
    }
    
    // Draw Architectural Illustration in Center
    ctx.saveGState()
    
    let zoomFactor: CGFloat = 1.0 + CGFloat(sin(t * 0.15)) * 0.08
    let panY: CGFloat = CGFloat(t * 4.0)
    
    ctx.translateBy(x: 540, y: 1050 - panY)
    ctx.scaleBy(x: zoomFactor, y: zoomFactor)
    
    // Ambient Golden Glow
    if let glowGrad = CGGradient(colorsSpace: colorSpace, colors: [
        CGColor(red: 0.85, green: 0.75, blue: 0.50, alpha: 0.18),
        CGColor(red: 0.85, green: 0.75, blue: 0.50, alpha: 0.0)
    ] as CFArray, locations: [0.0, 1.0]) {
        ctx.drawRadialGradient(glowGrad, startCenter: .zero, startRadius: 20, endCenter: .zero, endRadius: 420, options: [])
    }
    
    // Classical Dome & Pediment
    ctx.setStrokeColor(CGColor(red: 0.88, green: 0.82, blue: 0.70, alpha: 0.85))
    ctx.setLineWidth(3.5)
    
    // Temple Dome
    ctx.addArc(center: CGPoint(x: 0, y: 140), radius: 180, startAngle: 0, endAngle: CGFloat.pi, clockwise: false)
    ctx.strokePath()
    
    // Lantern
    ctx.stroke(CGRect(x: -25, y: 320, width: 50, height: 60))
    ctx.strokeLineSegments(between: [CGPoint(x: 0, y: 380), CGPoint(x: 0, y: 420)])
    
    // Architrave
    ctx.stroke(CGRect(x: -220, y: 100, width: 440, height: 40))
    
    // 6 Ionic Columns
    let colX: [CGFloat] = [-190, -114, -38, 38, 114, 190]
    for x in colX {
        ctx.strokeLineSegments(between: [CGPoint(x: x, y: 100), CGPoint(x: x, y: -220)])
    }
    
    // Base steps
    ctx.stroke(CGRect(x: -250, y: -250, width: 500, height: 30))
    ctx.stroke(CGRect(x: -280, y: -280, width: 560, height: 30))
    
    // Marble Bust & Relief Representation (Comolli & Voltaic Pile)
    if t >= 4.0 && t < 41.0 {
        ctx.setStrokeColor(CGColor(red: 0.95, green: 0.90, blue: 0.80, alpha: 0.75))
        ctx.stroke(CGRect(x: -70, y: -160, width: 140, height: 160)) // Pedestal
        ctx.addArc(center: CGPoint(x: 0, y: 30), radius: 45, startAngle: 0, endAngle: CGFloat.pi * 2, clockwise: true) // Bust head
        ctx.strokePath()
        
        // Voltaic Pile symbol (alternating zinc & copper disks)
        for diskIdx in 0..<8 {
            let dy = CGFloat(diskIdx * 12) - 130
            ctx.strokeLineSegments(between: [CGPoint(x: -30, y: dy), CGPoint(x: 30, y: dy)])
        }
    }
    
    // Floral Gesture Close-up representation (Block 4: 41-45s)
    if t >= 41.0 {
        ctx.setStrokeColor(CGColor(red: 0.92, green: 0.88, blue: 0.78, alpha: 0.9))
        ctx.setLineWidth(4.0)
        // Floral bouquet at base
        for petalIdx in 0..<7 {
            let angle = Double(petalIdx) * (Double.pi / 3.5)
            let px = cos(angle) * 70.0
            let py = sin(angle) * 45.0 - 240.0
            ctx.addArc(center: CGPoint(x: px, y: py), radius: 26, startAngle: 0, endAngle: CGFloat.pi * 2, clockwise: true)
            ctx.strokePath()
        }
    }
    
    ctx.restoreGState()
    
    // HEADER OVERLAY (Brand & Verified Monument badge)
    let headerFont = CTFontCreateWithName("HelveticaNeue-Medium" as CFString, 30, nil)
    let headerAttr: [NSAttributedString.Key: Any] = [
        .font: headerFont,
        .foregroundColor: NSColor(red: 0.85, green: 0.75, blue: 0.50, alpha: 0.95)
    ]
    let headerStr = NSAttributedString(string: "FLOREMORIA · MONUMENTAL MEMORY", attributes: headerAttr)
    let headerLine = CTLineCreateWithAttributedString(headerStr)
    ctx.textPosition = CGPoint(x: 100, y: 1780)
    CTLineDraw(headerLine, ctx)
    
    let subHeaderFont = CTFontCreateWithName("HelveticaNeue" as CFString, 24, nil)
    let subHeaderAttr: [NSAttributedString.Key: Any] = [
        .font: subHeaderFont,
        .foregroundColor: NSColor(red: 0.70, green: 0.70, blue: 0.72, alpha: 0.85)
    ]
    let subHeaderStr = NSAttributedString(string: "Mausoleo di Alessandro Volta (1745–1827) · Camnago Volta (Como)", attributes: subHeaderAttr)
    let subHeaderLine = CTLineCreateWithAttributedString(subHeaderStr)
    ctx.textPosition = CGPoint(x: 100, y: 1735)
    CTLineDraw(subHeaderLine, ctx)
    
    // CURRENT SUBTITLE / NARRATION CUE
    let currentSubtitle: String
    if t < 3.8 {
        currentSubtitle = "Qui riposa l'uomo che ha dato la scintilla al mondo moderno."
    } else if t < 20.8 {
        currentSubtitle = "Siamo a Camnago Volta, a Como. Il mausoleo neoclassico custodisce il busto in marmo di Comolli e i rilievi della celebre pila."
    } else if t < 40.8 {
        currentSubtitle = "L'invenzione della pila e l'eredità silenziosa custodita tra le colline di Como testimoniano come la scintilla del genio continui a vivere."
    } else {
        currentSubtitle = "Un gesto sobrio di cura e rispetto per chi ha illuminato la storia. FloreMoria: la memoria eterna."
    }
    
    // Draw Subtitle Card Box at Bottom
    let subCardRect = CGRect(x: 80, y: 180, width: 920, height: 210)
    ctx.setFillColor(CGColor(red: 0.05, green: 0.05, blue: 0.06, alpha: 0.82))
    ctx.setStrokeColor(CGColor(red: 0.85, green: 0.75, blue: 0.50, alpha: 0.6))
    ctx.setLineWidth(2.0)
    let cardPath = CGPath(roundedRect: subCardRect, cornerWidth: 20, cornerHeight: 20, transform: nil)
    ctx.addPath(cardPath)
    ctx.drawPath(using: .fillStroke)
    
    // Draw Subtitle text wrapped
    let subFont = CTFontCreateWithName("HelveticaNeue-Bold" as CFString, 34, nil)
    let paraStyle = NSMutableParagraphStyle()
    paraStyle.alignment = .center
    paraStyle.lineSpacing = 6
    
    let subAttr: [NSAttributedString.Key: Any] = [
        .font: subFont,
        .foregroundColor: NSColor.white,
        .paragraphStyle: paraStyle
    ]
    let subAttrStr = NSAttributedString(string: currentSubtitle, attributes: subAttr)
    let framesetter = CTFramesetterCreateWithAttributedString(subAttrStr)
    let textRect = CGRect(x: 100, y: 195, width: 880, height: 175)
    let textPath = CGPath(rect: textRect, transform: nil)
    let textFrame = CTFramesetterCreateFrame(framesetter, CFRangeMake(0, 0), textPath, nil)
    CTFrameDraw(textFrame, ctx)
    
    // FOOTER INSTAGRAM / BRAND OVERLAY
    let footerFont = CTFontCreateWithName("HelveticaNeue-Medium" as CFString, 22, nil)
    let footerAttr: [NSAttributedString.Key: Any] = [
        .font: footerFont,
        .foregroundColor: NSColor(red: 0.60, green: 0.60, blue: 0.60, alpha: 0.7)
    ]
    let footerStr = NSAttributedString(string: "Instagram Reels · www.floremoria.com · Monumento Certificato", attributes: footerAttr)
    let footerLine = CTLineCreateWithAttributedString(footerStr)
    ctx.textPosition = CGPoint(x: 230, y: 110)
    CTLineDraw(footerLine, ctx)
}

print("[MOMO RENDERER] Rendering \(totalFrames) frame video 1080x1920 a 30fps...")

var frameCount = 0
while frameCount < totalFrames {
    while !writerInput.isReadyForMoreMediaData {
        usleep(1000)
    }
    
    var pixelBuffer: CVPixelBuffer?
    let status = CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, adaptor.pixelBufferPool!, &pixelBuffer)
    guard status == kCVReturnSuccess, let buffer = pixelBuffer else {
        fatalError("Errore creazione PixelBuffer")
    }
    
    CVPixelBufferLockBaseAddress(buffer, [])
    let pxData = CVPixelBufferGetBaseAddress(buffer)
    let rgbColorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapContext = CGContext(
        data: pxData,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
        space: rgbColorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
    )!
    
    drawFrame(ctx: bitmapContext, frameIdx: frameCount, totalFrames: totalFrames)
    CVPixelBufferUnlockBaseAddress(buffer, [])
    
    let presentationTime = CMTime(value: Int64(frameCount), timescale: fps)
    adaptor.append(buffer, withPresentationTime: presentationTime)
    
    frameCount += 1
    if frameCount % 300 == 0 {
        print("[MOMO RENDERER] Progresso: \(frameCount)/\(totalFrames) frame (\(Int(Double(frameCount)/Double(totalFrames)*100))%)")
    }
}

writerInput.markAsFinished()

let group = DispatchGroup()
group.enter()
writer.finishWriting {
    print("[MOMO RENDERER] Traccia video completata con successo!")
    group.leave()
}
group.wait()

print("[MOMO RENDERER] Video 9:16 completato e salvato in: \(videoOutputPath)")
