import Foundation
import AVFoundation

let outputDir = "/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/public/media/social/momo"
let videoPath = outputDir + "/test_volta_camnago_reel.mp4"
let audioWav = outputDir + "/audio/adagio_strings_cc0.wav"
let voiceWav = outputDir + "/audio/volta_narration.wav"
let tempMuxPath = outputDir + "/test_volta_camnago_reel_muxed.mp4"

let videoAsset = AVURLAsset(url: URL(fileURLWithPath: videoPath))
let audioAsset = AVURLAsset(url: URL(fileURLWithPath: audioWav))
let voiceAsset = AVURLAsset(url: URL(fileURLWithPath: voiceWav))

let composition = AVMutableComposition()

// Add Video Track
if let videoTrack = videoAsset.tracks(withMediaType: .video).first,
   let compVideoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) {
    let videoDuration = videoAsset.duration
    try? compVideoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: videoDuration), of: videoTrack, at: .zero)
}

// Add Music Audio Track
if let musicTrack = audioAsset.tracks(withMediaType: .audio).first,
   let compMusicTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
    let dur = min(audioAsset.duration, videoAsset.duration)
    try? compMusicTrack.insertTimeRange(CMTimeRange(start: .zero, duration: dur), of: musicTrack, at: .zero)
}

// Add Voice Narration Audio Track
if let voiceTrack = voiceAsset.tracks(withMediaType: .audio).first,
   let compVoiceTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
    let dur = min(voiceAsset.duration, videoAsset.duration)
    try? compVoiceTrack.insertTimeRange(CMTimeRange(start: .zero, duration: dur), of: voiceTrack, at: .zero)
}

if FileManager.default.fileExists(atPath: tempMuxPath) {
    try? FileManager.default.removeItem(atPath: tempMuxPath)
}

guard let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
    fatalError("ExportSession creation failed")
}

exportSession.outputURL = URL(fileURLWithPath: tempMuxPath)
exportSession.outputFileType = .mp4

let group = DispatchGroup()
group.enter()
exportSession.exportAsynchronously {
    if exportSession.status == .completed {
        print("[MOMO MUXER] Audio e Video uniti con successo!")
        try? FileManager.default.removeItem(atPath: videoPath)
        try? FileManager.default.moveItem(atPath: tempMuxPath, toPath: videoPath)
    } else {
        print("[MOMO MUXER] Export status: \(exportSession.status.rawValue), error: \(String(describing: exportSession.error))")
    }
    group.leave()
}
group.wait()
