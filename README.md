# 억매방 영어학원 관리사이트 만들기

이 폴더는 초보자 강의용 완성 예제입니다.

## 1단계. GitHub에 코드 보관하기

1. GitHub 새 계정으로 로그인합니다.
2. 오른쪽 위 `+` 버튼을 누르고 `New repository`를 선택합니다.
3. 저장소 이름을 `eokmaebang-english-academy`로 입력합니다.
4. `Public` 또는 `Private`를 선택합니다.
5. `Create repository`를 누릅니다.
6. 이 폴더의 파일을 GitHub 저장소에 올립니다.

초보자용 터미널 명령:

```bash
git init
git add .
git commit -m "억매방 영어학원 관리사이트 첫 업로드"
git branch -M main
git remote add origin https://github.com/내아이디/eokmaebang-english-academy.git
git push -u origin main
```

## 2단계. Vercel에 배포하기

1. Vercel에 GitHub 계정으로 로그인합니다.
2. `Add New...` 또는 `New Project`를 누릅니다.
3. GitHub 저장소 `eokmaebang-english-academy`를 선택합니다.
4. Framework Preset은 기본값 또는 `Other`로 둡니다.
5. Root Directory가 이 폴더로 잡혔는지 확인합니다.
6. `Deploy`를 누릅니다.

이후 GitHub에 새 코드를 올리면 Vercel 사이트가 자동으로 다시 배포됩니다.

## 3단계. OpenAI API 연결하기

Vercel에서 API 키는 코드에 직접 쓰지 않고 환경변수에 저장합니다.

1. OpenAI Platform에서 API Key를 만듭니다.
2. Vercel 프로젝트로 이동합니다.
3. `Settings` -> `Environment Variables`로 이동합니다.
4. 아래 값을 추가합니다.

| Name | Value |
|---|---|
| `OPENAI_API_KEY` | OpenAI에서 발급받은 API 키 |
| `OPENAI_MODEL` | `gpt-5` |

5. 저장 후 Vercel에서 다시 배포합니다.

## 사이트 기능

- 예시 학생 30명 자동 생성
- 학생 등록 및 삭제
- 출결 저장
- 학생별 학부모 보고서 생성
- PDF 저장 및 인쇄
- 보고서 이미지 저장
- 휴대폰 공유 기능으로 카카오톡 전달 가능

## 파일 설명

| 파일 | 역할 |
|---|---|
| `index.html` | 학생관리, 출결관리, 보고서 화면 |
| `api/generate-report.js` | OpenAI API를 안전하게 호출하는 Vercel 서버 파일 |
| `package.json` | 프로젝트 기본 정보 |
| `vercel.json` | Vercel 함수 설정 |

## 수업 진행 순서

1. 먼저 `index.html`을 브라우저로 열어 화면을 확인합니다.
2. 학생을 선택하고 출결을 저장합니다.
3. 보고서 생성 버튼을 눌러 예시 보고서를 확인합니다.
4. GitHub에 업로드합니다.
5. Vercel에 연결합니다.
6. Vercel 환경변수에 OpenAI API Key를 넣습니다.
7. 배포 주소에서 실제 AI 보고서 생성을 확인합니다.
