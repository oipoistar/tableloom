<script setup lang="ts">
import { ref } from 'vue';
import Icon from './Icon.vue';
import {
  connectionInfo,
  connectionState,
  connectionRole,
  connect,
  disconnect,
  createRoom,
  addMember,
  roomMembers,
  transferOwnership,
} from '../collaboration-client';
import { reportError, notify } from '../store';
import type { Role } from '../core/collaboration';
const members = ref<{ id: string; name: string; role: Role }[]>([]);
const transferTarget = ref('');
async function loadMembers() {
  try {
    members.value = await roomMembers();
  } catch (e) {
    reportError(e);
  }
}
async function transfer() {
  try {
    await transferOwnership(transferTarget.value);
  } catch (e) {
    reportError(e);
  }
}
const url = ref('http://127.0.0.1:4318');
const room = ref('');
const token = ref('');
const admin = ref('');
const name = ref('Designer');
const memberName = ref('Teammate');
const memberRole = ref<Role>('editor');
const invitation = ref('');
const busy = ref(false);
async function join(adopt = false) {
  busy.value = true;
  try {
    await connect(url.value, room.value, token.value, adopt);
  } catch (e) {
    reportError(e);
  } finally {
    busy.value = false;
  }
}
async function create() {
  busy.value = true;
  try {
    const result = await createRoom(url.value, admin.value, name.value);
    room.value = result.roomId;
    token.value = result.token;
    admin.value = '';
    await connect(url.value, room.value, token.value);
    notify('Private collaboration room created');
  } catch (e) {
    reportError(e);
  } finally {
    busy.value = false;
  }
}
async function invite() {
  try {
    const result = await addMember(memberName.value, memberRole.value);
    invitation.value = `Server: ${connectionInfo.value?.url}\nRoom: ${connectionInfo.value?.roomId}\nRole: ${result.role}\nAccess token: ${result.token}`;
  } catch (e) {
    reportError(e);
  }
}
</script>
<template>
  <section class="settings-card">
    <div class="inline spread">
      <h3>Shared workspace</h3>
      <span class="tag" :class="connectionState === 'connected' ? 'green' : 'amber'"
        >{{ connectionState
        }}<span v-if="connectionState === 'connected'"> · {{ connectionRole }}</span></span
      >
    </div>
    <p class="muted">
      Connect to a private Tableloom server when you want to work with other designers. Your local project is
      saved before joining.
    </p>
    <label>Server address<input v-model="url" placeholder="https://tableloom.example.com" /></label>
    <div class="form-grid">
      <label>Room ID<input v-model="room" autocomplete="off" /></label
      ><label>Access token<input v-model="token" type="password" autocomplete="off" /></label>
    </div>
    <div class="inline">
      <button class="button primary" :disabled="busy || !room || !token" @click="join(false)">
        <Icon name="Users" />Connect</button
      ><button class="button" :disabled="busy || !room || !token" @click="join(true)">
        Open room project</button
      ><button v-if="connectionInfo" class="button" @click="disconnect">Disconnect</button>
    </div>
    <details>
      <summary>Create a room on your server</summary>
      <div class="stack top-gap">
        <label>Your display name<input v-model="name" /></label
        ><label
          >Server administration token<input v-model="admin" type="password" autocomplete="off"
        /></label>
        <p class="muted">Creating a room copies this project to the server above.</p>
        <button class="button" :disabled="!admin || busy" @click="create">Create private room</button>
      </div>
    </details>
    <template v-if="connectionState === 'connected' && connectionRole === 'owner'"
      ><h3 class="top-gap">Add a collaborator</h3>
      <div class="form-grid">
        <label>Name<input v-model="memberName" /></label
        ><label
          >Role<select v-model="memberRole">
            <option value="editor">Editor</option>
            <option value="commenter">Commenter</option>
            <option value="viewer">Viewer</option>
          </select></label
        >
      </div>
      <button class="button" @click="invite">Create access token</button
      ><textarea
        v-if="invitation"
        :value="invitation"
        readonly
        rows="5"
        aria-label="Collaborator connection details"
      ></textarea>
      <p class="muted">
        Share these details with the person you choose. Tableloom does not send invitations.
      </p>
      <details @toggle="loadMembers">
        <summary>Transfer room ownership</summary>
        <p class="muted">The selected member becomes the owner. You remain an editor.</p>
        <select v-model="transferTarget" aria-label="New owner">
          <option value="">Choose a member</option>
          <option v-for="m in members.filter((m) => m.role !== 'owner')" :key="m.id" :value="m.id">
            {{ m.name }} · {{ m.role }}
          </option></select
        ><button class="button" :disabled="!transferTarget" @click="transfer">Transfer ownership</button>
      </details></template
    >
  </section>
</template>
