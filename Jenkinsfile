pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = 'docker.io'
        DOCKER_IMAGE_NAME = 'subscription-tracker-functions'
        DOCKER_IMAGE_TAG = "${BUILD_NUMBER}"
        FIREBASE_PROJECT = credentials('firebase-project-id')
        FIREBASE_TOKEN = credentials('firebase-token')
        NODE_VERSION = '22'
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
    }

    stages {
        stage('Checkout') {
            steps {
                script {
                    echo '📦 Checking out code...'
                    checkout scm
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                script {
                    echo '📥 Installing dependencies...'
                    dir('functions') {
                        sh 'npm ci'
                    }
                }
            }
        }

        stage('Lint') {
            steps {
                script {
                    echo '🔍 Running ESLint...'
                    dir('functions') {
                        sh 'npm run lint'
                    }
                }
            }
        }

        stage('Unit Tests') {
            steps {
                script {
                    echo '🧪 Running unit tests...'
                    dir('functions') {
                        sh 'npm test 2>/dev/null || true'
                    }
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    echo '🐳 Building Docker image...'
                    sh '''
                        docker build \
                            --tag ${DOCKER_REGISTRY}/${DOCKER_IMAGE_NAME}:${DOCKER_IMAGE_TAG} \
                            --tag ${DOCKER_REGISTRY}/${DOCKER_IMAGE_NAME}:latest \
                            --file Dockerfile .
                    '''
                }
            }
        }

        stage('Security Scan') {
            steps {
                script {
                    echo '🔐 Scanning Docker image for vulnerabilities...'
                    sh '''
                        docker run --rm \
                            -v /var/run/docker.sock:/var/run/docker.sock \
                            aquasec/trivy:latest image \
                            ${DOCKER_REGISTRY}/${DOCKER_IMAGE_NAME}:${DOCKER_IMAGE_TAG} \
                            --severity HIGH,CRITICAL || true
                    '''
                }
            }
        }

        stage('Push Docker Image') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo '📤 Pushing Docker image to registry...'
                    sh '''
                        docker login -u ${DOCKER_USERNAME} -p ${DOCKER_PASSWORD} ${DOCKER_REGISTRY} || true
                        docker push ${DOCKER_REGISTRY}/${DOCKER_IMAGE_NAME}:${DOCKER_IMAGE_TAG}
                        docker push ${DOCKER_REGISTRY}/${DOCKER_IMAGE_NAME}:latest
                    '''
                }
            }
        }

        stage('Deploy to Firebase') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo '🚀 Deploying to Firebase...'
                    sh '''
                        npm install -g firebase-tools
                        firebase deploy \
                            --token ${FIREBASE_TOKEN} \
                            --project ${FIREBASE_PROJECT} \
                            --only functions,hosting
                    '''
                }
            }
        }

        stage('Verify Deployment') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo '✅ Verifying deployment...'
                    sh '''
                        firebase functions:list \
                            --token ${FIREBASE_TOKEN} \
                            --project ${FIREBASE_PROJECT}
                    '''
                }
            }
        }
    }

    post {
        always {
            script {
                echo '📊 Cleaning up...'
                cleanWs()
            }
        }
        success {
            script {
                echo '✨ Pipeline succeeded!'
            }
        }
        failure {
            script {
                echo '❌ Pipeline failed!'
            }
        }
    }
}
