package com.lee.reader;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.json.JSONObject;

/**
 * Private user data handoff via Android app-specific external storage for ADB over USB.
 * No email, cloud account, global storage permission, or network access is needed.
 * The user must explicitly enable/authorize USB debugging on their Mac.
 */
@CapacitorPlugin(name = "ReaderUsb")
public class ReaderUsbPlugin extends Plugin {
    private static final int MAX_BYTES = 6 * 1024 * 1024;
    private File root() throws Exception {
        File external = getContext().getExternalFilesDir(null);
        if (external == null) throw new Exception("External app directory unavailable");
        File dir = new File(external, "lee-reader-sync");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("Failed to create sync directory");
        return dir;
    }
    private String limited(PluginCall call) throws Exception {
        String raw = call.getString("data");
        if (raw == null) throw new Exception("Missing data");
        if (raw.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) throw new Exception("Sync snapshot too large");
        JSONObject obj = new JSONObject(raw);
        if (!"lee-reader-export".equals(obj.optString("kind")) || obj.optJSONArray("events") == null)
            throw new Exception("Invalid reader export envelope");
        return raw;
    }
    @PluginMethod
    public void saveSnapshot(PluginCall call) {
        try {
            String data = limited(call);
            File dir = root();
            File temp = new File(dir, "snapshot.tmp");
            try (FileOutputStream out = new FileOutputStream(temp)) {out.write(data.getBytes(StandardCharsets.UTF_8));out.getFD().sync();}
            File current = new File(dir, "snapshot.json");
            if (current.exists() && !current.delete()) throw new Exception("Cannot replace old snapshot");
            if (!temp.renameTo(current)) throw new Exception("Cannot finalize snapshot");
            JSObject result = new JSObject();result.put("saved",true);call.resolve(result);
        } catch(Exception e) {call.reject("USB export failed: "+e.getMessage());}
    }
    @PluginMethod
    public void readInbox(PluginCall call) {
        try {
            File inbox = new File(root(), "inbox.json");
            JSObject result = new JSObject();
            if (!inbox.exists()) {result.put("data","");call.resolve(result);return;}
            if (inbox.length() > MAX_BYTES) throw new Exception("Inbox too large");
            String data = new String(Files.readAllBytes(inbox.toPath()), StandardCharsets.UTF_8);
            result.put("data", data);call.resolve(result);
        } catch(Exception e) {call.reject("USB inbox read failed: "+e.getMessage());}
    }
    @PluginMethod
    public void acknowledgeInbox(PluginCall call) {
        try {
            File inbox = new File(root(), "inbox.json");
            if (inbox.exists() && !inbox.delete()) throw new Exception("Failed to remove imported inbox");
            call.resolve();
        } catch(Exception e) {call.reject("USB acknowledgment failed: "+e.getMessage());}
    }
}
