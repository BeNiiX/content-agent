// OCR d'images avec le framework Vision (macOS, sans dépendance). Usage : bin/ocr img1.jpg img2.jpg … → une ligne JSON par image
// {"file":"…","lines":[{"text":"…","y":0.12,"x":0.5,"h":0.03,"conf":0.98}]}  (coordonnées normalisées, origine en haut à gauche)
import Foundation
import Vision
import AppKit

func ocr(_ path: String) -> [[String: Any]] {
    guard let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return [] }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = true
    req.recognitionLanguages = ["fr-FR", "en-US"]
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do { try handler.perform([req]) } catch { return [] }
    var out: [[String: Any]] = []
    for obs in req.results ?? [] {
        guard let c = obs.topCandidates(1).first else { continue }
        let b = obs.boundingBox // origine en bas à gauche
        out.append(["text": c.string, "conf": Double(c.confidence), "x": Double(b.midX), "y": Double(1 - b.maxY), "h": Double(b.height), "w": Double(b.width)])
    }
    out.sort { ($0["y"] as! Double) < ($1["y"] as! Double) }
    return out
}
for path in CommandLine.arguments.dropFirst() {
    let lines = ocr(path)
    let obj: [String: Any] = ["file": path, "lines": lines]
    if let d = try? JSONSerialization.data(withJSONObject: obj), let s = String(data: d, encoding: .utf8) { print(s) }
}
