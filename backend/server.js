const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Server } = require('node-osc');
const config = require('./config.json');
const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;
const OSC_PORT = 9022;

let accessToken = '';
let streamList = [];
let streamMap = {};

let currentStreamIndex = 0;

const oscServer = new Server(OSC_PORT, '0.0.0.0', () => {
  console.log(`OSC server listening on udp://0.0.0.0:${OSC_PORT}`);
});

oscServer.on('message', function (msg) {
  const address = msg[0];  
  console.log('OSC message received:', address, msg);

  const match = address.match(/^\/kiloview\/setInput\/(\d)$/);
  if (match) {
    const index = parseInt(match[1]);
    setOutputByNumber(index);
  }

});

app.get('/api/test', (req, res) => {
  res.json({ message: 'Server working' });
});

app.listen(PORT, async () => {
  console.log(`HTTP server running on http://localhost:${PORT}`);

  try {
    await login();
    const sources = await getSources();

    for (const group of sources) {
      for (const stream of group.streams) {
        await registerSourceForPreview(stream);
      }
    }

    console.log("All sources registered for preview.");
  } catch (error) {
    console.error('Startup sequence failed:', error);
  }
});

async function login() {
  const res = await axios.post(`http://${config.ip}/api/users/login`, {
    username: config.username,
    password: config.password
  }, {
    headers: {
      'Content-Type': 'application/json',
      'app': 'test'
    }
  });

  accessToken = res.data.data.token;
  console.log('Token retrieved:', accessToken);
}

async function getSources() {
  const res = await axios.post(`http://${config.ip}/api/source/groups/list`, {
    is_need_stream: true
  }, {
    headers: {
      'Content-Type': 'application/json',
      'app': accessToken
    }
  });

  const sources = res.data.data;
  let count = 1;

  for (const group of sources) {
    for (const stream of group.streams) {
      if (stream.enable === 1 && count <= 4) {
        streamList.push(stream);
        streamMap[count] = stream;
        count++;
      }
    }
  }

  return sources;
}

async function registerSourceForPreview(stream) {
  await axios.post(`http://${config.ip}/api/preview/source/modify`, {
    from: {
      type: "source",
      stream_id: stream.id,
      stream_name: stream.name,
      stream_url: stream.url,
      pos_id: "",
      output_id: "1",
      layout_id: ""
    },
    to: {
      type: "preview",
      stream_id: stream.id,
      stream_name: stream.name,
      stream_url: stream.url,
      output_id: "1",
      layout_id: ""
    }
  }, {
    headers: {
      'Content-Type': 'application/json',
      'app': accessToken
    }
  });

  console.log(`Stream ${stream.name} registered for preview.`);
}


async function setOutputByNumber(index) {
  const stream = streamMap[index];
  if (!stream) {
    console.log(`Stream ${index} not found.`);
    return;
  }

  try {
    await registerSourceForPreview(stream);
    await setOutput(stream);
    console.log(`Switched to stream ${stream.name}`);
  } catch (err) {
    console.error(`Failed to switch to stream ${index}:`, err);
  }
}

async function setOutput(stream) {
  await axios.post(`http://${config.ip}/api/output/source/set`, {
    from: {
      output_id: "1",
      pos_id: 1
    },
    to: {
      output_id: "1",
      pos_id: 1,
      stream_id: stream.id
    }
  }, {
    headers: {
      'Content-Type': 'application/json',
      'app': accessToken
    }
  });

  console.log(`Output switched to stream ${stream.name}`);
}
