import { StatusBar } from 'expo-status-bar';
import { Component, useState } from 'react';
import { StyleSheet, Text, View, Button, TextInput, ScrollView, FlatList } from 'react-native';
import PouchDB from 'pouchdb-react-native';
import { io } from 'socket.io-client';

// const socket = io('http://referralworktesting-env.eba-esbeud5w.ap-south-1.elasticbeanstalk.com', {
const socket= io('http://192.168.1.6:3001',{
  reconnectionDelayMax: 10000,
  auth: {
    token: "123"
  },
  query: {
    "userid": "RITIK"
  }
});

const TIMESTAMP_OFFSET = 1265890309000
const db = new PouchDB('chatdb');
const recentmsg_db = new PouchDB('latestmsg');

class chat extends Component {
  constructor(props) {
    super(props)
    this.state = {
      userstatus: "offline",
      userid: "1AB43CL8",
      input: "",
      recent_timestamp: TIMESTAMP_OFFSET,
      stop_sync: false,
      TODO: [],
    },
    
    this.heartbeatSchedular = null;
    this.textinput = null;
    socket.removeAllListeners();
    clearInterval(this.heartbeatSchedular);
    this.heartbeatSchedular = setInterval(this.heartBeat, 3000)
    this.InputSender = this.InputSender.bind(this);
    this.InputTextHandler = this.InputTextHandler.bind(this);
    this.getMessagesFromRemoteDb = this.getMessagesFromRemoteDb.bind(this);
    this.syncLocalDb = this.syncLocalDb.bind(this)
    this.loadMessagesFromLocal = this.loadMessagesFromLocal.bind(this)

    // listener for recieveing the message sent for the user
    socket.on("msg-recieved", async (msg) => {
      
      // get message object and recent message object
      const msgObject = this.getMessageObject(msg, false, msg.senderid);
      const recentMsgObject = this.getRecentMessageObject(msg, msg.senderid);

      // save message object in local db
      await db.post(msgObject);

      // save recent message object in local db
      await recentmsg_db.get(msg.senderid).then(doc => {
        recentMsgObject["_rev"] = doc._rev
        recentmsg_db.put(recentMsgObject)
      }).catch(err => {
        recentmsg_db.post(recentMsgObject)
      });

      this.setState({ TODO: [{ data: { msg: msg.msg, belongs: false }, index: Math.random().toString() }, ...this.state.TODO] })
    });

    // listener for recieving message sent by the user
    socket.on("msg-sent", async (msg) => {

      // get message object and recent message object
      const msgObject = this.getMessageObject(msg, true, msg.recipientid);
      let recentMsgObject = this.getRecentMessageObject(msg, msg.recipientid);

      // save message object in local db
      await db.post(msgObject);

      // save recent message object in local db
      await recentmsg_db.get(msg.recipientid).then(doc => {
        recentMsgObject["_rev"] = doc._rev
        recentmsg_db.put(recentMsgObject)
      }).catch(err => {
        recentmsg_db.post(recentMsgObject)
      });
      this.setState({ TODO: [{ data: { msg: msg.msg, belongs: true }, index: Math.random().toString() }, ...this.state.TODO] })
    });

    // listener for disconnect event
    socket.on('disconnect', () => {
      socket.removeAllListeners();
    });

    // listener for getting status of recipient
    socket.on("getStatus", (msg) => {
      console.log(msg);
      this.setState({ userstatus: msg });
    })

    // listener for synced messages from server
    socket.on("syncDbMsg", async (data) => {
      this.setState({ stop_sync: data.is_end })
      const msgs = data.msgs
      console.log(msgs)
      // if msgs array is empty
      if (msgs.length) {
        this.setState({ recent_timestamp: msgs[msgs.length - 1].createdAt })
        await this.putMessageInLocalDb(msgs)
      }

      // if all messages has not been fetched
      if (!this.state.stop_sync) {
        this.getMessagesFromRemoteDb()
      }
      else {
        this.loadMessagesFromLocal()
      }
    })
  }

  componentDidMount() {
    console.log("AMIT");
    // sync the local db with remote db
    this.syncLocalDb().then(() => {
      this.loadMessagesFromLocal()
    })
  }

  /** 
    function: load messages from local db
  **/
  loadMessagesFromLocal() {
    const query = {
      selector: {
        recipientid: "AMIT",
      }
    };

    db.allDocs({ selector: query }).then(docs => {
      for (const data of docs.rows) {
        this.setState({ TODO: [{ data: { msg: data.doc.msg, belongs: data.doc.belongs }, index: Math.random().toString() }, ...this.state.TODO] })
      }
    });
  }

  /** 
    function: sync local db with remote db
  **/
  async syncLocalDb() {
    return recentmsg_db.get("AMIT").then((doc) => {

      // if some msgs are there in local db
      // retrieve recent messages
      this.setState({ recent_timestamp: doc.createdAt })
      this.getMessagesFromRemoteDb()
    }).catch(function (error) {

      // if nothing is there in local db
      // retrieve all msgs till now
      this.getMessagesFromRemoteDb()
    })
  }

  /** 
    function: get messages from remote db  
  **/
  getMessagesFromRemoteDb() {
    console.log(this.state.recent_timestamp)
    socket.emit('syncDb', { recent_timestamp: this.state.recent_timestamp })
  }

  /** 
    parameters: 
      msgs - array of message objects sent from server
    function: put all the messages and recent message in local db  
  **/
  async putMessageInLocalDb(msgs) {

    // get array of message objects
    const msgsObject = 
      msgs.map(
        msg => this.getMessageObject(
          msg, 
          (msg.senderid == 'RITIK'), 
          (msg.senderid == 'RITIK') ? msg.recipientid : msg.senderid
      ))
    
      // get map of recent message objects
    const recentMsgsObjectMap = new Map(msgs.map(
      msg => [
        (msg.senderid == 'RITIK') ? msg.senderid : msg.recipientid, 
        this.getRecentMessageObject(msg, (msg.senderid == 'RITIK') ? msg.recipientid : msg.senderid)
      ]))

    console.log('msg', msgsObject)
    // save all message objects in local db
    return db.bulkDocs(msgsObject, async (err, response) => {
      if (err)
        console.log(err)
      else {

        console.log("recentMsg", recentMsgsObjectMap)
        // save all recent message objects in local db
        for (let [recentMsgKey, recentMsgValue] of recentMsgsObjectMap) {
          await recentmsg_db.get(recentMsgKey).then(doc => {
            recentMsgValue["_rev"] = doc._rev
            recentmsg_db.put(recentMsgValue)
          }).catch(err => {
            recentmsg_db.post(recentMsgValue)
          });
        }
      }
    })
  }

  /** 
    parameters: 
      message_object - message object sent from server, 
      belongs - true if message is sent by user,
      recipient - recipient id
    return: message object for saving in local db 
  **/
  getMessageObject(msg, belongs, chatBuddy) {
    return {
      msg: msg.msg,
      type: msg.type,
      chatBuddy: chatBuddy,
      _id: msg.id.toString(),
      createdAt: msg.createdAt,
      belongs: belongs,
    }
  }

  /** 
    parameters: 
      message_object - message object sent from server, 
      recipient - recipient id
    return: message object for saving in local db 
  **/
  getRecentMessageObject(msg, chatBuddy) {
    return {
      msg: msg.msg,
      type: msg.type,
      _id: chatBuddy,
      createdAt: msg.createdAt
    }
  }

  /**
    function: sends heartbeat and checks recipient status
  **/
  heartBeat = () => {
    socket.emit("heartbeat", 'ping')
    socket.emit("checkStatus", { recipientid: "AMIT", senderid: "RITIK" });
  }

  /** 
    function: handler for on type in msg input
  **/
  InputTextHandler(inputvalue) {
    this.setState({ input: inputvalue })
  }

  /** 
    function: send message to recipient
  **/
  InputSender() {
    textinput.clear();
    const payload = { text: this.state.input, recipientid: "AMIT", type: "TEXT" };
    socket.emit('sendMessages', payload);
  }

  render() {
    const renderitem = (item, index) => {
      return (
        <View key={item.item.index} style={[styles.chatitem, item.item.data.belongs ? styles.right : styles.left]}>
          <Text>{item.item.data.msg}</Text>
        </View>

      );
    }
    return (
      <View style={[styles.custom, styles.container1]}>
        <StatusBar barStyle="light-content" backgroundColor="white" />
        <View style={styles.customstatusbar}>
          <Text style={styles.status}>{this.state.userstatus}</Text>
          <Text style={styles.status}>{this.state.userid}</Text>
        </View>
        <FlatList style={styles.fullWidthContainer} data={this.state.TODO} keyExtractor={(item) => item.index} renderItem={renderitem} inverted={true} />
        <View style={styles.container}>
          <TextInput placeholder="Write your text!" style={[styles.searchbar, styles.custom1]} onChangeText={this.InputTextHandler} ref={input => { textinput = input }} />
          <Button title="DM" onPress={this.InputSender} />
        </View>
      </View>

    );
  }
}

// styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    position: 'absolute',
    bottom: 0,
    padding: 10,
    width: '100%',
    backgroundColor: "#fffaf0",
  },
  custom: {
    marginTop: 27,
    padding: 0,
  },
  container1: {
    flex: 2,
    flexDirection: "column",
    justifyContent: "space-between",
  },
  searchbar: {
    borderWidth: 1,
    borderColor: "red",
    marginRight: 10,
    width: "80%",
  },
  custom1: {
    height: 40,
    padding: 3,
  },
  chatitem: {
    margin: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#5e0acc",
    color: "white",
  },
  right: {
    alignSelf: 'flex-end',
    backgroundColor: '#5e0acc',
  },
  left: {
    alignSelf: 'flex-start',
    backgroundColor: '#ccc',
  },
  fullWidthContainer: {
    flex: 1,
    alignSelf: 'stretch',
    marginBottom: 60,
  },
  customstatusbar: {
    height: 40,
    backgroundColor: "#e0ffff",
    position: 'relative',
    width: '100%',
    top: 0,
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "space-around",
  },
  status: {
    textAlign: "center",
    color: "#1F2130",
    marginTop: 5,
  }
});

export default chat;