<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import type { UpdateStatus } from '../updates';
const state = ref<UpdateStatus>();
const open = ref(false);
const dismissed = ref('');
const token = ref('');
const saving = ref(false);
const error = ref('');
let unsubscribe: (() => void) | undefined;
onMounted(async () => {
  const api = window.tableloom;
  if (!api) return;
  unsubscribe = api.onUpdateChanged((value) => (state.value = value));
  try {
    state.value = await api.updateStatus();
  } catch {
    error.value = 'Update preferences could not be loaded.';
  }
});
onBeforeUnmount(() => unsubscribe?.());
async function check() {
  error.value = '';
  try {
    state.value = await window.tableloom!.checkUpdates();
  } catch {
    error.value = 'Could not check for updates. Try again.';
  }
}
async function configure(changes: { automatic?: boolean; useGitHubCli?: boolean; token?: string }) {
  saving.value = true;
  error.value = '';
  try {
    state.value = await window.tableloom!.configureUpdates(changes);
    token.value = '';
  } catch {
    error.value = 'Preferences could not be saved. Check that secure credential storage is available.';
  } finally {
    saving.value = false;
  }
}
async function openRelease() {
  try {
    await window.tableloom!.openRelease();
  } catch {
    error.value = 'The release page could not be opened.';
    open.value = true;
  }
}
</script>
<template>
  <div v-if="state" class="update-control">
    <aside v-if="state.available && dismissed !== state.latestVersion" class="update-notice" role="status">
      <Icon name="Download" :size="20" />
      <div>
        <strong>Tableloom {{ state.latestVersion }} is available</strong>
        <p>See what’s new and download the update.</p>
        <button class="button primary" @click="openRelease">View release <Icon name="ArrowUpRight" /></button>
      </div>
      <button
        class="icon-button"
        aria-label="Dismiss update notification"
        @click="dismissed = state.latestVersion ?? ''"
      >
        <Icon name="X" />
      </button>
    </aside>
    <button class="update-button" @click="open = true">
      <Icon name="Download" :size="13" />{{ state.available ? 'Update available' : 'Updates' }}
    </button>
  </div>
  <Modal
    v-if="open && state"
    title="Tableloom updates"
    @close="
      open = false;
      token = '';
    "
  >
    <div class="update-settings">
      <div>
        <div class="eyebrow">INSTALLED VERSION</div>
        <h2>Tableloom {{ state.currentVersion }}</h2>
        <p class="muted">Releases from {{ state.repository }}</p>
      </div>
      <p role="status">
        {{ state.checking ? 'Checking GitHub…' : state.message || 'Check for a new version of Tableloom.' }}
      </p>
      <p v-if="state.checkedAt" class="muted">
        Last successful check: {{ new Date(state.checkedAt).toLocaleString() }} · {{ state.authSource }}
      </p>
      <div class="inline">
        <button class="button primary" :disabled="state.checking || saving" @click="check">
          {{ state.checking ? 'Checking…' : 'Check for updates' }}</button
        ><button class="button" @click="openRelease">
          {{ state.available ? 'Download update' : 'View releases' }} <Icon name="ArrowUpRight" />
        </button>
      </div>
      <label class="update-option"
        ><input
          type="checkbox"
          :checked="state.automatic"
          :disabled="saving"
          @change="configure({ automatic: ($event.target as HTMLInputElement).checked })"
        />Check at startup and every six hours</label
      >
      <div class="update-access">
        <h3>Private repository access</h3>
        <p>
          Use your GitHub CLI sign-in, or save a token with <strong>Contents: read</strong> access to this
          repository.
        </p>
        <label class="update-option"
          ><input
            type="checkbox"
            :checked="state.useGitHubCli"
            :disabled="saving"
            @change="configure({ useGitHubCli: ($event.target as HTMLInputElement).checked })"
          />Use GitHub CLI when no token is saved</label
        >
        <p class="muted">To sign in with GitHub CLI, run <code>gh auth login</code> in your terminal.</p>
        <label class="update-token"
          >GitHub access token<input
            v-model="token"
            type="password"
            autocomplete="off"
            spellcheck="false"
            :disabled="!state.canStoreToken || saving"
            :placeholder="state.hasToken ? 'A token is saved on this device' : 'Fine-grained access token'"
        /></label>
        <div class="inline">
          <button
            class="button"
            :disabled="!token.trim() || !state.canStoreToken || saving"
            @click="configure({ token: token.trim() })"
          >
            Save token</button
          ><button v-if="state.hasToken" class="button" :disabled="saving" @click="configure({ token: '' })">
            Remove saved token
          </button>
        </div>
        <p class="muted">
          {{
            state.canStoreToken
              ? 'Saved tokens are encrypted by your operating system and stay on this device.'
              : 'Secure storage is unavailable. Sign in with GitHub CLI to check private releases.'
          }}
        </p>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <p class="muted">
        Update checks send no project data. Downloads open on GitHub; install them when you’re ready.
      </p>
    </div>
  </Modal>
</template>
<style scoped>
.update-control {
  position: fixed;
  right: 18px;
  bottom: 33px;
  z-index: 70;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}
.update-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid #d4d8ce;
  border-radius: 20px;
  background: #fafbf7;
  color: #445844;
  box-shadow: 0 2px 10px #23312110;
  font-size: 11px;
}
.update-notice {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  max-width: 410px;
  background: #fafbf7;
  border: 1px solid #cbd5c3;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 8px 30px #23312120;
}
.update-notice p {
  margin: 6px 0 14px;
  color: #697162;
}
.update-settings {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.update-settings h2,
.update-settings h3,
.update-settings p {
  margin: 0;
}
.update-option {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 9px;
}
.update-access {
  border-top: 1px solid #dedfd7;
  padding-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.update-token {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.update-token input {
  width: 100%;
}
</style>
