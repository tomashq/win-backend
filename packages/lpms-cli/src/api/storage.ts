import type { ActionController } from '../types';
import { createReadStream } from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { requiredConfig, getConfig } from './config';
import { green, yellow, red } from '../utils/print';
import { getAuthHeader } from './login';


export const storageController: ActionController = async ({ metadata, file }, program) => {
  try {
    requiredConfig(['apiUrl']);

    if (!metadata && !file) {
      throw new Error('Either --metadata or --file option must be provided');
    }

    if (metadata && file) {
      yellow(
        'You specified both --metadata and --file option at once. --file option is ignored'
      );
    }

    const authHeader = await getAuthHeader();

    const filePath = (metadata || file) as string;
    const form = new FormData();
    form.append('file', createReadStream(filePath));
    const formHeaders = form.getHeaders();

    const response = await axios.post(
      `${getConfig('apiUrl')}/api/storage/${metadata ? 'metadata' : 'file'}`,
      form,
      {
        headers: {
          ...authHeader,
          ...formHeaders,
        }
      }
    );

    if (response.status === 200) {
      return green(
        `${filePath} has been uploaded successfully. Storage Id: ${response.data}`
      );
    }

    red(
      `Something went wrong. Server responded with status: ${response.status}`
    );
  } catch (error) {
    program.error(error, { exitCode: 1 });
  }
};