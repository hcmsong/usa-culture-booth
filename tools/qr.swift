// QR 코드 PNG 생성·판독(macOS 내장 CoreImage, 외부 라이브러리 없음)
// 생성: swift tools/qr.swift make <주소> <출력.png>   (모듈 1칸 = 1픽셀, 여백 없음)
// 판독: swift tools/qr.swift read <그림.png>
import CoreImage
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: make <url> <out.png> | read <in.png>"); exit(2) }

if args[1] == "make", args.count >= 4 {
  let f = CIFilter(name: "CIQRCodeGenerator")!
  f.setValue(args[2].data(using: .utf8), forKey: "inputMessage")
  f.setValue("M", forKey: "inputCorrectionLevel")
  let img = f.outputImage!
  let rep = NSBitmapImageRep(ciImage: img)
  let png = rep.representation(using: .png, properties: [:])!
  try! png.write(to: URL(fileURLWithPath: args[3]))
  print("ok \(Int(img.extent.width))x\(Int(img.extent.height))")
} else if args[1] == "read" {
  let det = CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!
  let img = CIImage(contentsOf: URL(fileURLWithPath: args[2]))!
  let msgs = det.features(in: img).compactMap { ($0 as? CIQRCodeFeature)?.messageString }
  print(msgs.isEmpty ? "판독 실패" : msgs.joined(separator: "\n"))
}
