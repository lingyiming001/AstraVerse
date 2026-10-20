import Foundation
import AppKit
import ApplicationServices
import ScreenCaptureKit

func emit(_ value: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
}
struct BridgeError: Error { let message: String }
func fail(_ message: String) throws -> Never { throw BridgeError(message: message) }

@main struct Bridge {
    static func main() async {
        do {
            let data = FileHandle.standardInput.readDataToEndOfFile()
            guard let args = try JSONSerialization.jsonObject(with: data) as? [String: Any], let action = args["action"] as? String else { try fail("Invalid command") }
            let bounds = CGDisplayBounds(CGMainDisplayID())
            if action == "status" {
                emit(["installed": true, "platform": "macos", "accessibility": AXIsProcessTrusted(), "screen_recording": CGPreflightScreenCaptureAccess(), "width": bounds.width, "height": bounds.height]); return
            }
            if action == "screenshot" {
                guard CGPreflightScreenCaptureAccess() else { try fail("请在系统设置中授予屏幕录制权限，然后重启后端") }
                if #available(macOS 14.0, *) {
                    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
                    guard let display = content.displays.first(where: {$0.displayID == CGMainDisplayID()}) else { try fail("主显示器不可用") }
                    let filter = SCContentFilter(display: display, excludingWindows: [])
                    let config = SCStreamConfiguration()
                    let factor = min(1.0, 1280.0 / Double(display.width))
                    config.width = Int(Double(display.width) * factor); config.height = Int(Double(display.height) * factor)
                    config.showsCursor = true
                    let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
                    guard let jpeg = NSBitmapImageRep(cgImage: image).representation(using: .jpeg, properties: [.compressionFactor: 0.65]) else { try fail("截图编码失败") }
                    emit(["mime":"image/jpeg", "data":jpeg.base64EncodedString(), "width":image.width,"height":image.height]); return
                } else { try fail("屏幕查看需要 macOS 14 或更新版本") }
            }
            guard action == "open_url" || AXIsProcessTrusted() else { try fail("请在系统设置中授予辅助功能权限，然后重启后端") }
            if action == "click" {
                guard let x = args["x"] as? Double, let y = args["y"] as? Double, x >= 0, x <= 1, y >= 0, y <= 1 else { try fail("坐标必须位于0至1之间") }
                let point = CGPoint(x: bounds.minX + x * max(0,bounds.width-1), y: bounds.minY + y * max(0,bounds.height-1))
                CGEvent(mouseEventSource:nil,mouseType:.mouseMoved,mouseCursorPosition:point,mouseButton:.left)?.post(tap:.cghidEventTap)
                let right = args["button"] as? String == "right"
                let count = args["count"] as? Int ?? 1
                for index in 1...min(2,max(1,count)) {
                    let down=CGEvent(mouseEventSource:nil,mouseType:right ? .rightMouseDown : .leftMouseDown,mouseCursorPosition:point,mouseButton:right ? .right : .left)
                    let up=CGEvent(mouseEventSource:nil,mouseType:right ? .rightMouseUp : .leftMouseUp,mouseCursorPosition:point,mouseButton:right ? .right : .left)
                    down?.setIntegerValueField(.mouseEventClickState,value:Int64(index));up?.setIntegerValueField(.mouseEventClickState,value:Int64(index))
                    down?.post(tap:.cghidEventTap);up?.post(tap:.cghidEventTap)
                }
            } else if action == "type" {
                guard let text=args["text"] as? String, text.count<=2000 else { try fail("输入文本过长") }
                for scalar in text.unicodeScalars {
                    let chunk=Array(String(scalar).utf16)
                    for down in [true,false] {
                        let event=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:down)
                        chunk.withUnsafeBufferPointer { event?.keyboardSetUnicodeString(stringLength:chunk.count,unicodeString:$0.baseAddress) }
                        event?.post(tap:.cghidEventTap)
                    }
                }
            } else if action == "key" {
                let codes:[String:CGKeyCode] = ["a":0,"s":1,"d":2,"f":3,"h":4,"g":5,"z":6,"x":7,"c":8,"v":9,"b":11,"q":12,"w":13,"e":14,"r":15,"y":16,"t":17,"1":18,"2":19,"3":20,"4":21,"6":22,"5":23,"9":25,"7":26,"8":28,"0":29,"o":31,"u":32,"i":34,"p":35,"enter":36,"l":37,"j":38,"k":40,"n":45,"m":46,"tab":48,"space":49,"backspace":51,"escape":53,"delete":117,"left":123,"right":124,"down":125,"up":126,"home":115,"end":119,"pageup":116,"pagedown":121]
                guard let name=args["key"] as? String, let code=codes[name] else { try fail("不支持此按键") }
                let modifiers=args["modifiers"] as? [String] ?? []
                var flags=CGEventFlags()
                for value in modifiers { switch value { case "cmd":flags.insert(.maskCommand);case "ctrl":flags.insert(.maskControl);case "shift":flags.insert(.maskShift);case "alt":flags.insert(.maskAlternate);default:try fail("不支持此修饰键") } }
                for down in [true,false] { let event=CGEvent(keyboardEventSource:nil,virtualKey:code,keyDown:down);event?.flags=flags;event?.post(tap:.cghidEventTap) }
            } else if action == "scroll" {
                let amount=args["amount"] as? Int ?? 0
                CGEvent(scrollWheelEvent2Source:nil,units:.pixel,wheelCount:1,wheel1:Int32(max(-2000,min(2000,amount))),wheel2:0,wheel3:0)?.post(tap:.cghidEventTap)
            } else if action == "open_url" {
                guard let raw=args["url"] as? String, let url=URL(string:raw), ["https","http"].contains(url.scheme?.lowercased() ?? ""),url.host != nil,url.user == nil,url.password == nil else { try fail("仅支持HTTP(S)网页") }
                guard await MainActor.run(body: {NSWorkspace.shared.open(url)}) else { try fail("无法打开网页") }
            } else { try fail("未知电脑操作") }
            emit(["executed":true,"action":action])
        } catch {
            emit(["error":(error as? BridgeError)?.message ?? error.localizedDescription]);exit(1)
        }
    }
}
