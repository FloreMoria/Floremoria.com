import Foundation
import AVFoundation
import AppKit
import CoreGraphics
import CoreVideo

print("=========================================================")
print("  MOMO Real Reel Hardware Video Renderer (AVFoundation)  ")
print("=========================================================")

let fm = FileManager.default
let currentDir = fm.currentDirectoryPath

// CLI Arguments
var imageInputs: [String] = []
var rawVideoPath: String? = nil
var audioPath = "\(currentDir)/public/media/social/momo/audio/minimal_piano_einaudi_mood_cc0.wav"
var userSpecifiedOutput: String? = nil
var hookQuestion = "Ci sono luoghi dove la bellezza del paesaggio incontra la pace eterna."
var customDuration: Double? = nil

let args = CommandLine.arguments
var i = 1
while i < args.count {
    if args[i] == "--images" && i + 1 < args.count {
        let rawList = args[i + 1]
        let items = rawList.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
        imageInputs.append(contentsOf: items.filter { !$0.isEmpty })
        i += 2
    } else if args[i] == "--video" && i + 1 < args.count {
        rawVideoPath = args[i + 1]
        i += 2
    } else if args[i] == "--audio" && i + 1 < args.count {
        audioPath = args[i + 1]
        i += 2
    } else if args[i] == "--output" && i + 1 < args.count {
        userSpecifiedOutput = args[i + 1]
        i += 2
    } else if args[i] == "--hook" && i + 1 < args.count {
        hookQuestion = args[i + 1]
        i += 2
    } else if args[i] == "--duration" && i + 1 < args.count {
        customDuration = Double(args[i + 1])
        i += 2
    } else {
        i += 1
    }
}

// --------------------------------------------------------------------------
// Progressive Output Path Resolution ([slug]_[YYYY-MM-DD]_[progressivo].mp4)
// --------------------------------------------------------------------------
func resolveUniqueOutputPath(requestedPath: String?) -> String {
    let defaultRendersDir = "\(currentDir)/public/media/social/momo/renders"
    if !fm.fileExists(atPath: defaultRendersDir) {
        try? fm.createDirectory(atPath: defaultRendersDir, withIntermediateDirectories: true, attributes: nil)
    }
    
    let dateFormatter = DateFormatter()
    dateFormatter.dateFormat = "yyyy-MM-dd"
    let todayStr = dateFormatter.string(from: Date())
    
    let rawPath: String
    if let req = requestedPath, !req.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        rawPath = req.hasPrefix("/") ? req : "\(currentDir)/\(req)"
    } else {
        rawPath = "\(defaultRendersDir)/cimitero_storico_\(todayStr)_01.mp4"
    }
    
    let fileURL = URL(fileURLWithPath: rawPath)
    let parentDir = fileURL.deletingLastPathComponent().path
    if !fm.fileExists(atPath: parentDir) {
        try? fm.createDirectory(atPath: parentDir, withIntermediateDirectories: true, attributes: nil)
    }
    
    // If the requested exact path does not exist yet on disk, return it directly
    if !fm.fileExists(atPath: rawPath) {
        return rawPath
    }
    
    // If it already exists, compute next available progressive index (_01, _02, _03...)
    let ext = fileURL.pathExtension.isEmpty ? "mp4" : fileURL.pathExtension
    let filenameWithoutExt = fileURL.deletingPathExtension().lastPathComponent
    
    // Check if filename ends with _XX (e.g. _01, _02, _99)
    let regex = try? NSRegularExpression(pattern: "^(.*)_(\\d{2,3})$", options: [])
    var prefix = filenameWithoutExt
    var startSeq = 1
    
    if let match = regex?.firstMatch(in: filenameWithoutExt, options: [], range: NSRange(location: 0, length: filenameWithoutExt.utf16.count)) {
        if let prefixRange = Range(match.range(at: 1), in: filenameWithoutExt),
           let numRange = Range(match.range(at: 2), in: filenameWithoutExt) {
            prefix = String(filenameWithoutExt[prefixRange])
            startSeq = (Int(filenameWithoutExt[numRange]) ?? 1) + 1
        }
    }
    
    var seq = startSeq
    while seq < 1000 {
        let pad = String(format: "%02d", seq)
        let candidate = "\(parentDir)/\(prefix)_\(pad).\(ext)"
        if !fm.fileExists(atPath: candidate) {
            return candidate
        }
        seq += 1
    }
    
    return "\(parentDir)/\(prefix)_\(UUID().uuidString.prefix(6)).\(ext)"
}

let outputPath = resolveUniqueOutputPath(requestedPath: userSpecifiedOutput)
let outputFilename = URL(fileURLWithPath: outputPath).lastPathComponent
print("Target Output: \(outputPath)")
print("Filename:      \(outputFilename)")

// Fallback audio check
if !fm.fileExists(atPath: audioPath) {
    let fallbackAudio = "\(currentDir)/public/media/social/momo/audio/minimal_piano_einaudi_mood_cc0.wav"
    if fm.fileExists(atPath: fallbackAudio) {
        audioPath = fallbackAudio
    }
}

let targetWidth: Int = 1080
let targetHeight: Int = 1920
let renderSize = CGSize(width: CGFloat(targetWidth), height: CGFloat(targetHeight))
let fps: Int32 = 30

// Helper: Overlay Graphics
func createInstagramStickerImage(text: String, width: CGFloat = 880, fontSize: CGFloat = 44) -> (CGImage, CGFloat) {
    let paddingX: CGFloat = 44.0
    let paddingY: CGFloat = 36.0
    let textWidth = width - (paddingX * 2.0)
    let font = NSFont.boldSystemFont(ofSize: fontSize)
    let paragraphStyle = NSMutableParagraphStyle()
    paragraphStyle.alignment = .center
    paragraphStyle.lineSpacing = 6.0
    
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: NSColor(red: 0.12, green: 0.12, blue: 0.14, alpha: 1.0),
        .paragraphStyle: paragraphStyle
    ]
    let attrStr = NSAttributedString(string: text, attributes: attrs)
    let textRect = attrStr.boundingRect(
        with: CGSize(width: textWidth, height: 1000),
        options: [.usesLineFragmentOrigin, .usesFontLeading]
    )
    let totalHeight = ceil(textRect.height) + (paddingY * 2.0)
    let size = CGSize(width: width, height: totalHeight)
    
    let image = NSImage(size: size)
    image.lockFocus()
    let bgPath = NSBezierPath(roundedRect: NSRect(origin: .zero, size: size), xRadius: 28, yRadius: 28)
    NSColor.white.setFill()
    bgPath.fill()
    attrStr.draw(in: NSRect(x: paddingX, y: paddingY - 4, width: textWidth, height: ceil(textRect.height)))
    image.unlockFocus()
    var rect = CGRect(origin: .zero, size: size)
    return (image.cgImage(forProposedRect: &rect, context: nil, hints: nil)!, totalHeight)
}

func createInstagramHandleBadge() -> CGImage {
    let size = CGSize(width: 330, height: 60)
    let image = NSImage(size: size)
    image.lockFocus()
    let bgPath = NSBezierPath(roundedRect: NSRect(origin: .zero, size: size), xRadius: 30, yRadius: 30)
    NSColor(white: 0.0, alpha: 0.55).setFill()
    bgPath.fill()
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.boldSystemFont(ofSize: 22),
        .foregroundColor: NSColor.white
    ]
    NSAttributedString(string: "@APP_FLOREMORIA", attributes: attrs).draw(at: NSPoint(x: 32, y: 16))
    image.unlockFocus()
    var rect = CGRect(origin: .zero, size: size)
    return image.cgImage(forProposedRect: &rect, context: nil, hints: nil)!
}

func createBrandPill() -> CGImage {
    let size = CGSize(width: 360, height: 48)
    let image = NSImage(size: size)
    image.lockFocus()
    let bg = NSBezierPath(roundedRect: NSRect(origin: .zero, size: size), xRadius: 24, yRadius: 24)
    NSColor(white: 0.1, alpha: 0.65).setFill()
    bg.fill()
    let paragraphStyle = NSMutableParagraphStyle()
    paragraphStyle.alignment = .center
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: 19, weight: .semibold),
        .foregroundColor: NSColor(white: 0.95, alpha: 1.0),
        .paragraphStyle: paragraphStyle
    ]
    NSAttributedString(string: "FloreMoria • Memoria Viva", attributes: attrs).draw(in: NSRect(x: 0, y: 12, width: size.width, height: 26))
    image.unlockFocus()
    var rect = CGRect(origin: .zero, size: size)
    return image.cgImage(forProposedRect: &rect, context: nil, hints: nil)!
}

// Helper: Load Image from Path or Remote URL
func loadCGImage(from pathOrUrl: String) -> CGImage? {
    if pathOrUrl.hasPrefix("http://") || pathOrUrl.hasPrefix("https://") {
        guard let url = URL(string: pathOrUrl) else { return nil }
        var request = URLRequest(url: url)
        request.setValue("FloreMoria/1.0 (staff.floremoria@gmail.com)", forHTTPHeaderField: "User-Agent")
        var fetchedData: Data? = nil
        let sema = DispatchSemaphore(value: 0)
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let data = data, error == nil {
                fetchedData = data
            }
            sema.signal()
        }
        task.resume()
        _ = sema.wait(timeout: .now() + 15.0)
        
        if let data = fetchedData, let nsImage = NSImage(data: data) {
            var rect = CGRect(origin: .zero, size: nsImage.size)
            return nsImage.cgImage(forProposedRect: &rect, context: nil, hints: nil)
        }
        return nil
    } else {
        let absPath = pathOrUrl.hasPrefix("/") ? pathOrUrl : "\(currentDir)/\(pathOrUrl)"
        guard let nsImage = NSImage(contentsOfFile: absPath) else { return nil }
        var rect = CGRect(origin: .zero, size: nsImage.size)
        return nsImage.cgImage(forProposedRect: &rect, context: nil, hints: nil)
    }
}

// Function to draw an image with Ken Burns transform
func drawKenBurns(image: CGImage, progress: Double, mode: Int, alpha: CGFloat, in ctx: CGContext) {
    let imgW = CGFloat(image.width)
    let imgH = CGFloat(image.height)
    let canvasW = CGFloat(targetWidth)
    let canvasH = CGFloat(targetHeight)
    
    // Base aspect fill scale
    let baseScale = max(canvasW / imgW, canvasH / imgH)
    
    var scaleFactor: CGFloat = 1.0
    var offsetX: CGFloat = 0.0
    var offsetY: CGFloat = 0.0
    
    let t = CGFloat(progress)
    
    switch mode % 4 {
    case 0: // Smooth Zoom In
        scaleFactor = 1.04 + (0.12 * t)
    case 1: // Pan Left to Right with mild zoom
        scaleFactor = 1.12
        offsetX = (t - 0.5) * (canvasW * 0.08)
    case 2: // Smooth Zoom Out
        scaleFactor = 1.16 - (0.10 * t)
    default: // Pan Bottom to Top
        scaleFactor = 1.12
        offsetY = (t - 0.5) * (canvasH * 0.06)
    }
    
    let finalW = imgW * baseScale * scaleFactor
    let finalH = imgH * baseScale * scaleFactor
    let drawX = ((canvasW - finalW) / 2.0) + offsetX
    let drawY = ((canvasH - finalH) / 2.0) + offsetY
    
    ctx.saveGState()
    ctx.setAlpha(alpha)
    ctx.draw(image, in: CGRect(x: drawX, y: drawY, width: finalW, height: finalH))
    ctx.restoreGState()
}

// --------------------------------------------------------------------------
// BRANCH A: KEN BURNS RENDERING (When images are provided or default fallback)
// --------------------------------------------------------------------------
if !imageInputs.isEmpty || rawVideoPath == nil {
    var validImages: [CGImage] = []
    print("Loading \(imageInputs.count) image source(s)...")
    for imgPath in imageInputs {
        if let cg = loadCGImage(from: imgPath) {
            validImages.append(cg)
            print("  ✓ Loaded image: \(imgPath.prefix(65))...")
        } else {
            print("  ⚠️ Could not load: \(imgPath.prefix(65))...")
        }
    }
    
    // Fallback if no images succeeded
    if validImages.isEmpty {
        print("No valid custom images loaded. Checking fallback footage...")
        if rawVideoPath == nil {
            rawVideoPath = "\(currentDir)/public/media/social/momo/raw/cimitero_campagna_camminata_pov_real.mp4"
        }
    } else {
        let durationSeconds: Double = customDuration ?? 15.0
        let totalFrames = Int(durationSeconds * Double(fps))
        let photoDuration = durationSeconds / Double(validImages.count)
        let transitionDuration = 0.6
        
        let tempVideoPath = NSTemporaryDirectory() + "momo_temp_kb_\(UUID().uuidString).mp4"
        let tempVideoURL = URL(fileURLWithPath: tempVideoPath)
        try? fm.removeItem(at: tempVideoURL)
        
        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: targetWidth,
            AVVideoHeightKey: targetHeight,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: 8_000_000,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
            ]
        ]
        
        guard let assetWriter = try? AVAssetWriter(outputURL: tempVideoURL, fileType: .mp4) else {
            fatalError("Cannot create AVAssetWriter")
        }
        
        let writerInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        writerInput.expectsMediaDataInRealTime = false
        
        let sourcePixelBufferAttributes: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32ARGB),
            kCVPixelBufferWidthKey as String: targetWidth,
            kCVPixelBufferHeightKey as String: targetHeight,
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
        ]
        
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: writerInput,
            sourcePixelBufferAttributes: sourcePixelBufferAttributes
        )
        
        assetWriter.add(writerInput)
        assetWriter.startWriting()
        assetWriter.startSession(atSourceTime: .zero)
        
        let handleImage = createInstagramHandleBadge()
        let (stickerImage, stickerH) = createInstagramStickerImage(text: hookQuestion, width: 880, fontSize: 44)
        let brandImage = createBrandPill()
        
        func newPixelBuffer() -> CVPixelBuffer? {
            if let pool = adaptor.pixelBufferPool {
                var pixelBuffer: CVPixelBuffer?
                CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pixelBuffer)
                return pixelBuffer
            }
            var pixelBuffer: CVPixelBuffer?
            CVPixelBufferCreate(
                kCFAllocatorDefault,
                targetWidth,
                targetHeight,
                kCVPixelFormatType_32ARGB,
                sourcePixelBufferAttributes as CFDictionary,
                &pixelBuffer
            )
            return pixelBuffer
        }
        
        print("Rendering Ken Burns: \(totalFrames) frames @ 30fps (\(durationSeconds)s) with \(validImages.count) photo(s)...")
        
        for frameIdx in 0..<totalFrames {
            while !writerInput.isReadyForMoreMediaData {
                usleep(1000)
            }
            
            guard let pixelBuffer = newPixelBuffer() else {
                fatalError("Could not create pixel buffer at frame \(frameIdx)")
            }
            
            CVPixelBufferLockBaseAddress(pixelBuffer, [])
            let pixelData = CVPixelBufferGetBaseAddress(pixelBuffer)
            let colorSpace = CGColorSpaceCreateDeviceRGB()
            guard let ctx = CGContext(
                data: pixelData,
                width: targetWidth,
                height: targetHeight,
                bitsPerComponent: 8,
                bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
            ) else {
                fatalError("Cannot create CGContext")
            }
            
            // Background
            ctx.setFillColor(NSColor.black.cgColor)
            ctx.fill(CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight))
            
            let timeSec = Double(frameIdx) / Double(fps)
            let currentPhotoIdx = min(Int(timeSec / photoDuration), validImages.count - 1)
            let photoTime = timeSec - (Double(currentPhotoIdx) * photoDuration)
            let photoProgress = min(max(photoTime / photoDuration, 0.0), 1.0)
            
            // 1. Draw base photo
            drawKenBurns(image: validImages[currentPhotoIdx], progress: photoProgress, mode: currentPhotoIdx, alpha: 1.0, in: ctx)
            
            // 2. Cross-dissolve into next photo if near end
            let timeRemaining = photoDuration - photoTime
            if timeRemaining < transitionDuration && currentPhotoIdx + 1 < validImages.count {
                let dissolveAlpha = CGFloat((transitionDuration - timeRemaining) / transitionDuration)
                drawKenBurns(image: validImages[currentPhotoIdx + 1], progress: 0.0, mode: currentPhotoIdx + 1, alpha: dissolveAlpha, in: ctx)
            }
            
            // 3. Draw Overlays
            // A) Handle Badge (Top Right)
            ctx.draw(handleImage, in: CGRect(x: CGFloat(targetWidth - 360), y: CGFloat(targetHeight - 220), width: 330, height: 60))
            
            // B) Center Hook Sticker with Shadow
            let stickerX = CGFloat(targetWidth - 880) / 2.0
            let stickerY = CGFloat(targetHeight) / 2.0 - (stickerH / 2.0) + 40.0
            
            ctx.saveGState()
            ctx.setShadow(offset: CGSize(width: 0, height: -4), blur: 14, color: NSColor(white: 0.0, alpha: 0.4).cgColor)
            ctx.draw(stickerImage, in: CGRect(x: stickerX, y: stickerY, width: 880, height: stickerH))
            ctx.restoreGState()
            
            // C) Brand Pill (Bottom Center)
            ctx.draw(brandImage, in: CGRect(x: CGFloat(targetWidth - 360) / 2.0, y: 140, width: 360, height: 48))
            
            CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
            
            let presentationTime = CMTime(value: Int64(frameIdx), timescale: fps)
            adaptor.append(pixelBuffer, withPresentationTime: presentationTime)
        }
        
        writerInput.markAsFinished()
        let sema = DispatchSemaphore(value: 0)
        assetWriter.finishWriting {
            sema.signal()
        }
        sema.wait()
        
        // Mux Audio Track with Soft Fade Out
        let videoAsset = AVURLAsset(url: tempVideoURL)
        let composition = AVMutableComposition()
        let compDuration = CMTime(seconds: durationSeconds, preferredTimescale: 600)
        
        guard let compVideoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let sourceVideoTrack = videoAsset.tracks(withMediaType: .video).first else {
            fatalError("Failed video track setup")
        }
        try compVideoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: compDuration), of: sourceVideoTrack, at: .zero)
        
        if fm.fileExists(atPath: audioPath) {
            let audioAsset = AVURLAsset(url: URL(fileURLWithPath: audioPath))
            if let sourceAudioTrack = audioAsset.tracks(withMediaType: .audio).first,
               let compAudioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
                try compAudioTrack.insertTimeRange(CMTimeRange(start: .zero, duration: compDuration), of: sourceAudioTrack, at: .zero)
            }
        }
        
        let audioMix = AVMutableAudioMix()
        if let audioTrack = composition.tracks(withMediaType: .audio).first {
            let params = AVMutableAudioMixInputParameters(track: audioTrack)
            let fadeStart = CMTime(seconds: max(0.0, durationSeconds - 1.8), preferredTimescale: 600)
            let fadeRange = CMTimeRange(start: fadeStart, duration: CMTime(seconds: 1.8, preferredTimescale: 600))
            params.setVolumeRamp(fromStartVolume: 0.95, toEndVolume: 0.0, timeRange: fadeRange)
            audioMix.inputParameters = [params]
        }
        
        guard let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
            fatalError("Failed export session")
        }
        exportSession.outputURL = URL(fileURLWithPath: outputPath)
        exportSession.outputFileType = .mp4
        exportSession.audioMix = audioMix
        exportSession.timeRange = CMTimeRange(start: .zero, duration: compDuration)
        
        let exportSema = DispatchSemaphore(value: 0)
        exportSession.exportAsynchronously {
            exportSema.signal()
        }
        exportSema.wait()
        
        try? fm.removeItem(at: tempVideoURL)
        
        if exportSession.status == .completed {
            print("=========================================================")
            print("🎉 MOMO EXPORT SUCCESS!")
            print("Output file: \(outputPath)")
            print("Filename:    \(outputFilename)")
            print("=========================================================")
            exit(0)
        } else {
            print("❌ MOMO KEN BURNS FAILED: \(String(describing: exportSession.error))")
            exit(1)
        }
    }
}

// --------------------------------------------------------------------------
// BRANCH B: SINGLE VIDEO FOOTAGE RENDERING
// --------------------------------------------------------------------------
guard let rawVid = rawVideoPath, fm.fileExists(atPath: rawVid) else {
    fatalError("Missing raw video at: \(rawVideoPath ?? "nil")")
}

let videoAsset = AVURLAsset(url: URL(fileURLWithPath: rawVid))
let videoDuration = CMTimeGetSeconds(videoAsset.duration)
let targetDurationSeconds = customDuration ?? min(videoDuration > 0 ? videoDuration : 13.0, 20.0)
let compositionDuration = CMTime(seconds: targetDurationSeconds, preferredTimescale: 600)
let timeRange = CMTimeRange(start: .zero, duration: compositionDuration)

let composition = AVMutableComposition()

// 1. Add Video Track
guard let sourceVideoTrack = videoAsset.tracks(withMediaType: .video).first else {
    fatalError("No video track found in raw footage")
}

let compVideoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try compVideoTrack.insertTimeRange(timeRange, of: sourceVideoTrack, at: .zero)

// 2. Add Audio Track (Piano)
if fm.fileExists(atPath: audioPath) {
    let audioAsset = AVURLAsset(url: URL(fileURLWithPath: audioPath))
    if let sourceAudioTrack = audioAsset.tracks(withMediaType: .audio).first {
        let compAudioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
        try compAudioTrack.insertTimeRange(timeRange, of: sourceAudioTrack, at: .zero)
    }
}

// 3. Configure Transform for 1080x1920 Aspect Fill
let naturalSize = sourceVideoTrack.naturalSize.applying(sourceVideoTrack.preferredTransform)
let srcW = abs(naturalSize.width)
let srcH = abs(naturalSize.height)

let scaleX = CGFloat(targetWidth) / srcW
let scaleY = CGFloat(targetHeight) / srcH
let scale = max(scaleX, scaleY)

let scaledW = srcW * scale
let scaledH = srcH * scale
let tx = (CGFloat(targetWidth) - scaledW) / 2.0
let ty = (CGFloat(targetHeight) - scaledH) / 2.0

var baseTransform = CGAffineTransform.identity
if sourceVideoTrack.preferredTransform.a == 0 && sourceVideoTrack.preferredTransform.d == 0 {
    baseTransform = sourceVideoTrack.preferredTransform
}
let layerTransform = baseTransform
    .concatenating(CGAffineTransform(scaleX: scale, y: scale))
    .concatenating(CGAffineTransform(translationX: tx, y: ty))

let instruction = AVMutableVideoCompositionInstruction()
instruction.timeRange = timeRange

let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compVideoTrack)
layerInstruction.setTransform(layerTransform, at: .zero)
instruction.layerInstructions = [layerInstruction]

// 4. Build Graphic Overlays (Instagram Native Sticker + Handle Badge + Brand Pill)
let rootLayer = CALayer()
rootLayer.frame = CGRect(x: 0, y: 0, width: CGFloat(targetWidth), height: CGFloat(targetHeight))

let videoLayer = CALayer()
videoLayer.frame = CGRect(x: 0, y: 0, width: CGFloat(targetWidth), height: CGFloat(targetHeight))
rootLayer.addSublayer(videoLayer)

let overlayLayer = CALayer()
overlayLayer.frame = CGRect(x: 0, y: 0, width: CGFloat(targetWidth), height: CGFloat(targetHeight))

// Handle badge
let handleImage = createInstagramHandleBadge()
let handleBadge = CALayer()
handleBadge.frame = CGRect(x: CGFloat(targetWidth - 360), y: CGFloat(targetHeight - 220), width: 330, height: 60)
handleBadge.contents = handleImage
handleBadge.contentsScale = 2.0
overlayLayer.addSublayer(handleBadge)

// Center Hook Question Sticker
let stickerWidth: CGFloat = 880
let (stickerImage, stickerH) = createInstagramStickerImage(text: hookQuestion, width: stickerWidth, fontSize: 44)
let stickerX = (CGFloat(targetWidth) - stickerWidth) / 2.0
let stickerY = (CGFloat(targetHeight) - stickerH) / 2.0 + 40

let stickerLayer = CALayer()
stickerLayer.frame = CGRect(x: stickerX, y: stickerY, width: stickerWidth, height: stickerH)
stickerLayer.contents = stickerImage
stickerLayer.contentsScale = 2.0
stickerLayer.shadowColor = NSColor.black.cgColor
stickerLayer.shadowOpacity = 0.35
stickerLayer.shadowOffset = CGSize(width: 0, height: -4)
stickerLayer.shadowRadius = 14
overlayLayer.addSublayer(stickerLayer)

// Brand Signature Pill
let brandImage = createBrandPill()
let brandLayer = CALayer()
brandLayer.frame = CGRect(x: (CGFloat(targetWidth) - 360) / 2.0, y: 140, width: 360, height: 48)
brandLayer.contents = brandImage
brandLayer.contentsScale = 2.0
overlayLayer.addSublayer(brandLayer)

rootLayer.addSublayer(overlayLayer)

// 5. Video Composition Tool with CoreAnimation
let videoComposition = AVMutableVideoComposition()
videoComposition.renderSize = renderSize
videoComposition.frameDuration = CMTime(value: 1, timescale: fps)
videoComposition.instructions = [instruction]
videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: rootLayer)

// 6. Audio Mix with Fade Out in last 1.8 seconds
let audioMix = AVMutableAudioMix()
if let audioTrack = composition.tracks(withMediaType: .audio).first {
    let audioInputParams = AVMutableAudioMixInputParameters(track: audioTrack)
    let fadeStart = CMTime(seconds: max(0.0, targetDurationSeconds - 1.8), preferredTimescale: 600)
    let fadeRange = CMTimeRange(start: fadeStart, duration: CMTime(seconds: 1.8, preferredTimescale: 600))
    audioInputParams.setVolumeRamp(fromStartVolume: 0.95, toEndVolume: 0.0, timeRange: fadeRange)
    audioMix.inputParameters = [audioInputParams]
}

// 7. Export Session
guard let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
    fatalError("Cannot create AVAssetExportSession")
}

exportSession.outputURL = URL(fileURLWithPath: outputPath)
exportSession.outputFileType = .mp4
exportSession.videoComposition = videoComposition
exportSession.audioMix = audioMix
exportSession.timeRange = timeRange

let semaphore = DispatchSemaphore(value: 0)

print("Starting export to: \(outputPath)...")
exportSession.exportAsynchronously {
    switch exportSession.status {
    case .completed:
        print("MOMO Export SUCCESS: \(outputPath)")
    case .failed:
        print("MOMO Export FAILED: \(String(describing: exportSession.error))")
    case .cancelled:
        print("MOMO Export CANCELLED")
    default:
        print("MOMO Export status: \(exportSession.status.rawValue)")
    }
    semaphore.signal()
}

semaphore.wait()

if exportSession.status == .completed {
    print("=========================================================")
    print("🎉 MOMO EXPORT SUCCESS!")
    print("Output file: \(outputPath)")
    print("Filename:    \(outputFilename)")
    print("=========================================================")
    exit(0)
} else {
    exit(1)
}
