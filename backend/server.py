from asyncio import protocols
from operator import index
from flask import Flask,request,jsonify
from flask_cors import CORS
import json
USER_FILE='users.json'
app=Flask(__name__)
CORS(app)
def load_users():
    with open(USER_FILE,'r') as f:
        return json.load(f)

def save_users(users):
    with open(USER_FILE,'w') as f:
        json.dump(users,f,indent=4)

@app.route('/ask',methods=['POST'])
def ask():
    data=request.get_json()
    user_text=data.get('text','')
    reply=f"Hello, {user_text}"
    return jsonify({'reply':reply})

@app.route('/register',methods=['GET'])
def register():
    data=request.get_json()
    username=data.get('username')
    password=data.get('password')

    user=load_users()
    if any(u["username"]==username for u in user):
        return jsonify({'message:':'Пользователь уже занят'}),409
    
    user.append({'username':username,'password':password})
    save_users(user)
    return jsonify({'message':'Регистрация прошла успешна'}),201

@app.route('/login',methods=['POST'])
def login():
    data=request.get_json()
    username=data.get('username')
    password=data.get('password')
    users=load_users()
    for user in users:
        if user['username']==username and user['password']==password:
            return jsonify({'message':'Успешно авторизировались'}),200
    return jsonify({'message':'Не правильный логин или пароль'}),401

if __name__=='__main__':
    app.run(debug=True,port=5000)