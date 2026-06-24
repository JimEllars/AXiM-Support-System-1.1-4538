import re

with open('src/pages/Dashboard.jsx', 'r') as f:
    content = f.read()

# Import
pattern_import = r"""import SystemBroadcastModal from '\.\./components/modals/SystemBroadcastModal';"""
replacement_import = """import SystemBroadcastModal from '../components/modals/SystemBroadcastModal';
import PayloadTraceInspectorModal from '../components/modals/PayloadTraceInspectorModal';"""
content = re.sub(pattern_import, replacement_import, content)

# Component mount
pattern_mount = r"""      <SystemBroadcastModal
        isOpen=\{modalType === 'broadcast'\}
        onClose=\{\(\) => setModalType\(null\)\}
      />
    </div>
  \);
\}"""
replacement_mount = """      <SystemBroadcastModal
        isOpen={modalType === 'broadcast'}
        onClose={() => setModalType(null)}
      />

      <PayloadTraceInspectorModal />
    </div>
  );
}"""
content = re.sub(pattern_mount, replacement_mount, content)

with open('src/pages/Dashboard.jsx', 'w') as f:
    f.write(content)

print("Patch applied")
