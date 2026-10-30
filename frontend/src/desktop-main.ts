import './style.css';
import { mount } from 'svelte';
import DesktopApp from './DesktopApp.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Application mount point is missing');
mount(DesktopApp, { target });
