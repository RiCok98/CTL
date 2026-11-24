# CTL 운영관리

교원파트·학습파트·원격파트의 프로그램을 운영 유형과 재원별로 관리하고, 예산 집행률과 목표 달성률을 확인하는 한국어 웹 앱입니다.

## 로컬 실행

저장소 루트에서 `python3 -m http.server 8000 --directory web`을 실행한 뒤 [http://localhost:8000](http://localhost:8000)를 엽니다. 로컬 실행에서 입력한 데이터는 현재 브라우저에 저장됩니다.

## 공유 운영

배포 환경에서는 ChatGPT Sites가 인증 및 사이트 접근을 처리하며, Worker는 `BUCKET` R2 바인딩을 사용하여 팀 프로그램을 공유 저장합니다. `node worker/build.mjs`로 배포용 Worker를 생성할 수 있습니다.
