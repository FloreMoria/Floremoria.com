import Foundation
import AVFoundation
import AppKit
import CoreGraphics

print("--- MOMO Real Reel Video Renderer (AVFoundation) ---")

let fm = FileManager.default
let currentDir = fm.currentDirectoryPath

// Parse arguments or set smart defaults
var rawVideoPath = "\(currentDir)/public/media/social/momo/raw/cimitero_campagna_camminata_pov_real.mp4"
var audioPath = "\(currentDir)/public/media/social/momo/audio/minimal_piano_einaudi_mood_cc0.wav"
var outputPath = "\(currentDir)/public/media/social/momo/test_momo_real_reel.mp4"
var hookQuestion = "Sapete chi è il personaggio molto importante che giace nella cappella di questo piccolo cimitero di campagna?"

let args = CommandLine.arguments
var i = 1
while i < args.count {
    if args[i] == "--video" && i + 1 < args.count {
        rawVideoPath = args[i + 1]
        i += 2
    } else if args[i] == "--audio" && i + 1 < args.count {
        audioPath = args[i + 1]
        i += 2
    } else if args[i] == "--output" && i + 1 < args.count {
        outputPath = args[i + 1]
        i += 2
    } else if args[i] == "--hook" && i + 1 < args.count {
        hookQuestion = args[i + 1]
        i += 2
    } else {
        i += 1
    }
}

guard fm.fileExists(atPath: rawVideoPath) else {
    fatalError("Missing raw video at: \(rawVideoPath)")
}
guard fm.fileExists(atPath: audioPath) else {
    fatalError("Missing audio at: \(audioPath)")
}

let targetWidth: CGFloat = 1080
let targetHeight: CGFloat = 1920
let renderSize = CGSize(width: targetWidth, height: targetHeight)

let videoAsset = AVURLAsset(url: URL(fileURLWithPath: rawVideoPath))
let audioAsset = AVURLAsset(url: URL(fileURLWithPath: audioPath))

let videoDuration = CMTimeGetSeconds(videoAsset.duration)
let targetDurationSeconds = min(videoDuration > 0 ? videoDuration : 13.0, 20.0)
let compositionDuration = CMTime(seconds: targetDurationSeconds, preferredTimescale: 600)
let timeRange = CMTimeRange(start: .zero, duration: compositionDuration)

let composition = AVMutableComposition()

// 1. Add Video Track
guard let sourceVideoTrack = videoAsset.tracks(withMediaType: .video).first else {
    fatalError("No video track found in raw footage")
}

let compVideoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try compVideoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: compositionDuration), of: sourceVideoTrack, at: .zero)

// 2. Add Audio Track (Piano)
if let sourceAudioTrack = audioAsset.tracks(withMediaType: .audio).first {
    let compAudioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
    try compAudioTrack.insertTimeRange(CMTimeRange(start: .zero, duration: compositionDuration), of: sourceAudioTrack, at: .zero)
}

// 3. Configure Transform for 1080x1920 Aspect Fill
let naturalSize = sourceVideoTrack.naturalSize.applying(sourceVideoTrack.preferredTransform)
let srcW = abs(naturalSize.width)
let srcH = abs(naturalSize.height)

let scaleX = targetWidth / srcW
let scaleY = targetHeight / srcH
let scale = max(scaleX, scaleY)

let scaledW = srcW * scale
let scaledH = srcH * scale
let tx = (targetWidth - scaledW) / 2.0
let ty = (targetHeight - scaledH) / 2.0

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

// 4. Build Graphic Overlays (Instagram Native Sticker + Handle Badge)
let rootLayer = CALayer()
rootLayer.frame = CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight)

let videoLayer = CALayer()
videoLayer.frame = CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight)
rootLayer.addSublayer(videoLayer)

let overlayLayer = CALayer()
overlayLayer.frame = CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight)

// Helper: Render native Instagram sticker to CGImage
func createInstagramStickerImage(text: String, width: CGFloat = 860, fontSize: CGFloat = 44) -> (CGImage, CGFloat) {
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
    
    let bgRect = NSRect(origin: .zero, size: size)
    let path = NSBezierPath(roundedRect: bgRect, xRadius: 28, yRadius: 28)
    NSColor.white.setFill()
    path.fill()
    
    let drawTextRect = NSRect(
        x: paddingX,
        y: paddingY - 4,
        width: textWidth,
        height: ceil(textRect.height)
    )
    attrStr.draw(in: drawTextRect)
    
    image.unlockFocus()
    var imageRect = CGRect(origin: .zero, size: size)
    let cg = image.cgImage(forProposedRect: &imageRect, context: nil, hints: nil)!
    return (cg, totalHeight)
}

// Helper: Render Instagram handle badge to CGImage
func createInstagramHandleBadge() -> CGImage {
    let size = CGSize(width: 330, height: 60)
    let image = NSImage(size: size)
    image.lockFocus()
    
    let bgPath = NSBezierPath(roundedRect: NSRect(origin: .zero, size: size), xRadius: 30, yRadius: 30)
    NSColor(white: 0.0, alpha: 0.55).setFill()
    bgPath.fill()
    
    let handleFont = NSFont.boldSystemFont(ofSize: 22)
    let attrs: [NSAttributedString.Key: Any] = [
        .font: handleFont,
        .foregroundColor: NSColor.white
    ]
    let str = NSAttributedString(string: "@APP_FLOREMORIA", attributes: attrs)
    str.draw(at: NSPoint(x: 32, y: 16))
    
    image.unlockFocus()
    var imageRect = CGRect(origin: .zero, size: size)
    return image.cgImage(forProposedRect: &imageRect, context: nil, hints: nil)!
}

// A) Add Instagram handle badge (Top Right)
let handleImage = createInstagramHandleBadge()
let handleBadge = CALayer()
handleBadge.frame = CGRect(x: targetWidth - 360, y: targetHeight - 220, width: 330, height: 60)
handleBadge.contents = handleImage
handleBadge.contentsScale = 2.0
overlayLayer.addSublayer(handleBadge)

// B) Add Center Hook Question Sticker
let stickerWidth: CGFloat = 880
let (stickerImage, stickerH) = createInstagramStickerImage(text: hookQuestion, width: stickerWidth, fontSize: 44)

let stickerX = (targetWidth - stickerWidth) / 2.0
let stickerY = (targetHeight - stickerH) / 2.0 + 40 // Centered in middle/upper third

let stickerLayer = CALayer()
stickerLayer.frame = CGRect(x: stickerX, y: stickerY, width: stickerWidth, height: stickerH)
stickerLayer.contents = stickerImage
stickerLayer.contentsScale = 2.0
stickerLayer.shadowColor = NSColor.black.cgColor
stickerLayer.shadowOpacity = 0.35
stickerLayer.shadowOffset = CGSize(width: 0, height: -4)
stickerLayer.shadowRadius = 14
overlayLayer.addSublayer(stickerLayer)

// C) Add Subtle Bottom Brand Signature Pill
func createBrandPill() -> CGImage {
    let size = CGSize(width: 360, height: 48)
    let image = NSImage(size: size)
    image.lockFocus()
    let bg = NSBezierPath(roundedRect: NSRect(origin: .zero, size: size), xRadius: 24, yRadius: 24)
    NSColor(white: 0.1, alpha: 0.65).setFill()
    bg.fill()
    
    let font = NSFont.systemFont(ofSize: 19, weight: .semibold)
    let paragraphStyle = NSMutableParagraphStyle()
    paragraphStyle.alignment = .center
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: NSColor(white: 0.95, alpha: 1.0),
        .paragraphStyle: paragraphStyle
    ]
    let str = NSAttributedString(string: "FloreMoria • Memoria Viva", attributes: attrs)
    str.draw(in: NSRect(x: 0, y: 12, width: size.width, height: 26))
    image.unlockFocus()
    var imageRect = CGRect(origin: .zero, size: size)
    return image.cgImage(forProposedRect: &imageRect, context: nil, hints: nil)!
}

let brandImage = createBrandPill()
let brandLayer = CALayer()
brandLayer.frame = CGRect(x: (targetWidth - 360) / 2.0, y: 140, width: 360, height: 48)
brandLayer.contents = brandImage
brandLayer.contentsScale = 2.0
overlayLayer.addSublayer(brandLayer)

rootLayer.addSublayer(overlayLayer)

// 5. Video Composition Tool with CoreAnimation
let videoComposition = AVMutableVideoComposition()
videoComposition.renderSize = renderSize
videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
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
if fm.fileExists(atPath: outputPath) {
    try? fm.removeItem(atPath: outputPath)
}

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
    print("SUCCESS: Rendered real footage reel at \(outputPath)")
    exit(0)
} else {
    exit(1)
}
